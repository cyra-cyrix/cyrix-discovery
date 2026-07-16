import Anthropic from '@anthropic-ai/sdk'
import type { ChatMessage, Coverage, Department, Fact, Interview } from '../types'
import { emptyCoverage } from '../types'
import { interviewerSystemPrompt, priorFindingsFor, reportSystemPrompt, REPORT_SCHEMA, TURN_SCHEMA } from './prompts'
import type { AnalysisResult } from './simulated'

export interface TurnResult {
  reply: string
  facts: Fact[]
  coverage: Coverage
}

function makeClient(apiKey: string): Anthropic {
  // Browser demo: key stays in the user's localStorage, calls go direct to the API.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
}

function toApiMessages(messages: ChatMessage[]): Anthropic.MessageParam[] {
  // Our 'ai' role is the interviewer (assistant); interviewee is the user.
  return messages.map((m) => ({
    role: m.role === 'ai' ? ('assistant' as const) : ('user' as const),
    content: m.text,
  }))
}

function extractText(response: Anthropic.Message): string {
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
}

function guardRefusal(response: Anthropic.Message): void {
  if (response.stop_reason === 'refusal') {
    throw new Error('The model declined this request. Try rephrasing or continue in simulated mode.')
  }
}

/** One interview turn: full history in, structured {reply, facts, coverage} out. */
export async function liveTurn(
  apiKey: string,
  model: string,
  dept: Department,
  interviews: Record<string, Interview>,
  messages: ChatMessage[],
  participant: import('../types').ParticipantContext | null = null,
): Promise<TurnResult> {
  const client = makeClient(apiKey)
  const response = await client.messages.create({
    model,
    max_tokens: 2000,
    system: interviewerSystemPrompt(dept, priorFindingsFor(interviews, dept.id), participant),
    messages: toApiMessages(messages),
    output_config: { format: { type: 'json_schema', schema: TURN_SCHEMA } },
  })
  guardRefusal(response)
  const parsed = JSON.parse(extractText(response)) as TurnResult
  const coverage: Coverage = { ...emptyCoverage(), ...parsed.coverage }
  // clamp 0..1
  for (const k of Object.keys(coverage) as (keyof Coverage)[]) {
    coverage[k] = Math.max(0, Math.min(1, coverage[k]))
  }
  return { reply: parsed.reply, facts: parsed.facts ?? [], coverage }
}

/** Opening question for a live interview. */
export async function liveOpening(
  apiKey: string,
  model: string,
  dept: Department,
  interviews: Record<string, Interview>,
  participant: import('../types').ParticipantContext | null = null,
): Promise<string> {
  const client = makeClient(apiKey)
  const response = await client.messages.create({
    model,
    max_tokens: 500,
    system: interviewerSystemPrompt(dept, priorFindingsFor(interviews, dept.id), participant),
    messages: [
      {
        role: 'user',
        content:
          '(The interviewee has just joined the session. Greet them in one short sentence and open the interview with your first concrete question. Return plain text, not JSON.)',
      },
    ],
  })
  guardRefusal(response)
  const text = extractText(response).trim()
  // The system prompt demands JSON on answer turns; if the model applied it
  // here too, unwrap the reply field.
  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text) as { reply?: string }
      if (parsed.reply) return parsed.reply
    } catch {
      // fall through — treat as plain text
    }
  }
  return text
}

/** Full post-interview analysis: profile, report, opportunities, graph edges. */
export async function liveAnalysis(
  apiKey: string,
  model: string,
  dept: Department,
  interview: Interview,
): Promise<AnalysisResult> {
  const client = makeClient(apiKey)
  const transcript = interview.messages
    .map((m) => `${m.role === 'ai' ? 'CONSULTANT' : 'INTERVIEWEE'}: ${m.text}`)
    .join('\n\n')
  const factList = interview.facts.map((f) => `[${f.dimension}] ${f.text}`).join('\n')
  const p = interview.participant
  const participantLine = p
    ? `PARTICIPANT: ${p.name || 'Name withheld'} · ${p.designation} · ${p.stateBranch} · ${p.yearsAtCyrix} at Cyrix · primary responsibility: "${p.responsibility}"\n\n`
    : ''

  // Long structured generation — stream to avoid HTTP timeouts.
  const stream = client.messages.stream({
    model,
    max_tokens: 16000,
    system: reportSystemPrompt(dept),
    messages: [
      {
        role: 'user',
        content: `${participantLine}FULL INTERVIEW TRANSCRIPT:\n\n${transcript}\n\nFACTS EXTRACTED DURING THE INTERVIEW:\n${factList}\n\nProduce the complete discovery analysis now.`,
      },
    ],
    output_config: { format: { type: 'json_schema', schema: REPORT_SCHEMA } },
  })
  const response = await stream.finalMessage()
  guardRefusal(response)
  const parsed = JSON.parse(extractText(response)) as {
    profile: AnalysisResult['profile']
    report: AnalysisResult['report']
    opportunities: Omit<AnalysisResult['opportunities'][number], 'id' | 'departmentId'>[]
    edges: AnalysisResult['edges']
  }
  return {
    profile: parsed.profile,
    report: parsed.report,
    opportunities: parsed.opportunities.map((o, i) => ({
      ...o,
      id: `${dept.id}-live-${i}`,
      departmentId: dept.id,
      confidence: Math.max(0, Math.min(100, o.confidence)),
      impact: Math.max(1, Math.min(10, o.impact)),
      effort: Math.max(1, Math.min(10, o.effort)),
    })),
    edges: parsed.edges.filter((e) => e.from && e.to && e.from !== e.to),
  }
}
