// Server-side Claude calls. The API key lives here and only here — a
// participant on a phone must never hold one, and a `VITE_*` variable would
// be public in the bundle.
//
// The prompts, schemas and shaping logic are imported unchanged from the
// existing interview engine (src/engine). This is a transport move, not a
// rewrite: one interviewer, one analyst, one source of truth.

import Anthropic from '@anthropic-ai/sdk'
import type { ChatMessage, Coverage, Fact, Interview, ParticipantContext } from '../../src/types.ts'
import { emptyCoverage } from '../../src/types.ts'
import {
  interviewerSystemPrompt, priorFindingsFor, reportSystemPrompt,
  REPORT_SCHEMA, TURN_SCHEMA,
} from '../../src/engine/prompts.ts'
import { allInterviews } from './_store.mts'

const DEFAULT_MODEL = 'claude-opus-4-8'

function client() {
  const apiKey = Netlify.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured on the server')
  return new Anthropic({ apiKey })
}

const textOf = (r: Anthropic.Message) =>
  r.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('')

function guard(r: Anthropic.Message) {
  if (r.stop_reason === 'refusal') throw new Error('The model declined this request.')
}

const toApiMessages = (messages: ChatMessage[]): Anthropic.MessageParam[] =>
  messages.map((m) => ({ role: m.role === 'ai' ? ('assistant' as const) : ('user' as const), content: m.text }))

export interface TurnBody {
  action: 'opening' | 'turn'
  model?: string
  participant: ParticipantContext | null
  personId: string
  messages?: ChatMessage[]
}

/** Short calls only — these fit inside the synchronous function budget.
 *
 *  Organizational memory is derived HERE, from storage — the client no longer
 *  sends its interviews map. That map was (a) multi-megabyte for admin runs,
 *  re-uploaded every turn, feeding the timeout that produced the 502s;
 *  (b) empty for participants, so cross-interview memory never worked for the
 *  people it was designed for; and (c) client-supplied text injected into the
 *  system prompt — an injection surface. Server storage is the truth. */
export async function runTurn(body: TurnBody) {
  const model = body.model || DEFAULT_MODEL
  const interviews = await allInterviews<Interview>()
  const system = interviewerSystemPrompt(body.participant, priorFindingsFor(interviews, body.personId))

  if (body.action === 'opening') {
    const r = await client().messages.create({
      model, max_tokens: 500, system,
      messages: [{
        role: 'user',
        content: '(The interviewee has just joined the session. Greet them in one short sentence and open the interview with your first concrete question. Return plain text, not JSON.)',
      }],
    })
    guard(r)
    const text = textOf(r).trim()
    if (text.startsWith('{')) {
      try {
        const parsed = JSON.parse(text) as { reply?: string }
        if (parsed.reply) return { reply: parsed.reply }
      } catch { /* plain text */ }
    }
    return { reply: text }
  }

  // effort 'low': a turn is one conversational step that must fit a
  // synchronous function budget — later turns produce more output (facts
  // accumulate), which is exactly when the 502s hit. Depth belongs to the
  // report, which runs in the background with no such budget.
  const r = await client().messages.create({
    model, max_tokens: 2000, system,
    messages: toApiMessages(body.messages ?? []),
    output_config: { effort: 'low', format: { type: 'json_schema', schema: TURN_SCHEMA } },
  })
  guard(r)
  // A truncated structured output is unclosed JSON — catch it as what it IS
  // (the model ran out of tokens), not as a parser stack trace. The client
  // treats any turn failure as "fall back to the offline interviewer", so the
  // message here is for logs, not participants.
  if (r.stop_reason === 'max_tokens') throw new Error('The turn was cut off at the token limit.')
  let parsed: { reply: string; facts: Fact[]; coverage: Coverage }
  try {
    parsed = JSON.parse(textOf(r)) as { reply: string; facts: Fact[]; coverage: Coverage }
  } catch {
    throw new Error('The model returned an unreadable turn.')
  }
  const coverage: Coverage = { ...emptyCoverage(), ...parsed.coverage }
  for (const k of Object.keys(coverage) as (keyof Coverage)[]) {
    coverage[k] = Math.max(0, Math.min(1, coverage[k]))
  }
  return { reply: parsed.reply, facts: parsed.facts ?? [], coverage }
}

/** The long one — only ever called from the background function. */
export async function runAnalysis(interview: Interview, model = DEFAULT_MODEL) {
  const transcript = interview.messages
    .map((m) => `${m.role === 'ai' ? 'CONSULTANT' : 'INTERVIEWEE'}: ${m.text}`)
    .join('\n\n')
  const factList = interview.facts.map((f) => `[${f.dimension}] ${f.text}`).join('\n')
  const p = interview.participant
  const participantLine = p
    ? `PARTICIPANT: ${p.name || 'Name withheld'} · ${p.designation} · ${p.stateBranch} · ${p.yearsAtCyrix} at Cyrix · stated department/team: ${p.department.trim() || '(not stated — infer it)'} · primary responsibility: "${p.responsibility}"\n\n`
    : ''

  const stream = client().messages.stream({
    model, max_tokens: 16000,
    system: reportSystemPrompt(interview.participant),
    messages: [{
      role: 'user',
      content: `${participantLine}FULL INTERVIEW TRANSCRIPT:\n\n${transcript}\n\nFACTS EXTRACTED DURING THE INTERVIEW:\n${factList}\n\nProduce the complete discovery analysis now.`,
    }],
    output_config: { format: { type: 'json_schema', schema: REPORT_SCHEMA } },
  })
  const r = await stream.finalMessage()
  guard(r)
  const parsed = JSON.parse(textOf(r))
  return {
    departmentName: parsed.departmentName?.trim() || interview.participant?.department.trim() || 'Unnamed team',
    profile: parsed.profile,
    report: parsed.report,
    opportunities: (parsed.opportunities ?? []).map((o: Record<string, number>, i: number) => ({
      ...o,
      id: `${interview.personId}-live-${i}`,
      personId: interview.personId,
      confidence: Math.max(0, Math.min(100, Number(o.confidence))),
      impact: Math.max(1, Math.min(10, Number(o.impact))),
      effort: Math.max(1, Math.min(10, Number(o.effort))),
    })),
    edges: (parsed.edges ?? []).filter(
      (e: { from: string; to: string }) =>
        e.from?.trim() && e.to?.trim() && e.from.trim().toLowerCase() !== e.to.trim().toLowerCase(),
    ),
  }
}
