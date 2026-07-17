// Runtime engine — server turn handler (M2). One participant turn =
// PERCEIVE (model) → EXTRACT (deterministic, M1) → decide (pure) → REALIZE
// (model). State checkpoints on Interview.runtime via the client's existing
// durability rails; evidence accrues in the M1 store incrementally (derived
// data, envelope per interview, extractor:'runtime').

import Anthropic from '@anthropic-ai/sdk'
import type { ChatMessage, Interview } from '../../src/types.ts'
import { DIMENSIONS } from '../../src/types.ts'
import { emptyFlags, initRuntimeState, activeTopic, type FlagSet, type RuntimeState, type TopicSeed } from '../../src/runtime/state.ts'
import { decide } from '../../src/runtime/decision.ts'
import { PERCEIVE_SCHEMA, PERCEIVE_SYSTEM, perceiveInput, type Perception } from '../../src/runtime/perceive.ts'
import { REALIZE_SYSTEM, realizeContext, realizeInstruction } from '../../src/runtime/realize.ts'
import { realizeCandidate, type EvidenceEnvelope } from '../../src/intelligence/evidence.ts'
import { EXTRACTOR_VERSION } from '../../src/intelligence/extraction.ts'
import { evidenceStore } from './_evidence-store.mts'

const MODEL = 'claude-opus-4-8'

/** Topic seeds from the 10 discovery dimensions, in plain participant terms.
 *  Priors (§15) may later adjust priorities/hypotheses through the ALLOWED
 *  channel only — never wording. `aiOpportunity`/`impact` are analysis lenses,
 *  not conversation topics, so they are not seeded (P11: no AI-hunting topic). */
const TOPIC_SEEDS: TopicSeed[] = DIMENSIONS
  .filter((d) => d.key !== 'aiOpportunity' && d.key !== 'impact')
  .map((d, i) => ({ id: `t${i}-${d.key}`, label: d.label.toLowerCase(), priority: 10 - i }))

const textOf = (r: Anthropic.Message) =>
  r.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('')

function client(): Anthropic {
  const apiKey = Netlify.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured on the server')
  return new Anthropic({ apiKey })
}

async function perceive(lastQuestion: string, utterance: string, idx: number, buffer: Array<{ id: string; line: string }>): Promise<Perception> {
  const r = await client().messages.create({
    model: MODEL, max_tokens: 4000, system: PERCEIVE_SYSTEM,
    messages: [{ role: 'user', content: perceiveInput(lastQuestion, utterance, idx, buffer) }],
    output_config: { effort: 'low', format: { type: 'json_schema', schema: PERCEIVE_SCHEMA } },
  })
  if (r.stop_reason === 'refusal' || r.stop_reason === 'max_tokens') throw new Error(`perceive:${r.stop_reason}`)
  const parsed = JSON.parse(textOf(r)) as { flags: FlagSet & { has_contradiction?: boolean }; candidates: Perception['candidates'] }
  const flags: FlagSet = { ...emptyFlags(), ...parsed.flags }
  // Schema can't express nullables cleanly: has_contradiction gates the ref.
  if (!(parsed.flags as { has_contradiction?: boolean }).has_contradiction) flags.contradicts_buffer = null
  else flags.contradicts_buffer = (parsed.flags.contradicts_buffer as string) || null
  return { flags, candidates: parsed.candidates ?? [] }
}

async function realize(moveInstruction: string, context: string): Promise<string> {
  const r = await client().messages.create({
    model: MODEL, max_tokens: 400, system: REALIZE_SYSTEM,
    messages: [{ role: 'user', content: `RECENT EXCHANGE:\n${context}\n\n${moveInstruction}\n\nWrite the single message now, plain text.` }],
    output_config: { effort: 'low' },
  })
  if (r.stop_reason === 'refusal') throw new Error('realize:refusal')
  return textOf(r).trim()
}

export interface RuntimeTurnBody {
  action: 'runtime-opening' | 'runtime-turn'
  personId: string
  interview: Interview // client's current interview (messages incl. latest answer)
}

export interface RuntimeTurnResult {
  reply: string
  runtime: RuntimeState
  closing: boolean // engine reached CLOSING/CLOSED — client may offer wrap-up
  evidence_count: number
}

export async function runtimeTurn(body: RuntimeTurnBody): Promise<RuntimeTurnResult> {
  const interview = body.interview
  const messages: ChatMessage[] = interview.messages ?? []

  let state: RuntimeState =
    (interview.runtime as RuntimeState | undefined) ?? initRuntimeState(TOPIC_SEEDS)

  let flags: FlagSet
  let candidates: Perception['candidates'] = []
  if (body.action === 'runtime-opening') {
    // The UI already performed FRAMING (welcome frame + explicit "I'm ready")
    // and collected orienting basics. That acknowledgment is real — the flag
    // records it; the engine then renders its first move (ORIENT).
    flags = { ...emptyFlags(), frame_acknowledged: true }
  } else {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    const lastAi = [...messages].reverse().find((m) => m.role === 'ai')
    if (!lastUser) throw new Error('runtime-turn without a participant utterance')
    const idx = messages.findIndex((m) => m.id === lastUser.id)
    const envelope = await evidenceStore().get(body.personId)
    const buffer = (envelope?.items ?? []).slice(-30).map((i) => ({ id: i.id, line: i.interpretation.slice(0, 100) }))
    const p = await perceive(lastAi?.text ?? '', lastUser.text, idx, buffer)
    flags = p.flags
    candidates = p.candidates.map((c) => ({ ...c, turn_index: idx }))
  }

  // Deterministic §11/§12 extraction — reusing the M1 pipeline verbatim.
  const participantText = messages.filter((m) => m.role === 'user').map((m) => m.text).join('\n')
  const role = interview.participant?.designation || 'participant'
  const prior = (await evidenceStore().get(body.personId)) ?? emptyEnvelope(body.personId, state)
  let yielded = false
  let dropped = prior.dropped_unanchored
  for (const c of candidates) {
    const r = realizeCandidate(c, participantText, body.personId, role)
    if (r.items.length > 0) yielded = true
    prior.items.push(...r.items)
    if (r.pointer) prior.pointers.push(r.pointer)
    if (r.droppedUnanchored) dropped++
  }
  // §13 cross-item flag: PERCEIVE referenced a buffered item → both sides flagged.
  if (flags.contradicts_buffer) {
    const other = prior.items.find((i) => i.id === flags.contradicts_buffer)
    const latest = prior.items[prior.items.length - 1]
    if (other && latest && other.id !== latest.id) {
      prior.contradictions.push({ id: `ct-${other.id}-${latest.id}`, item_a: other.id, item_b: latest.id, note: 'perceived in-interview conflict', resolved: false })
      for (const it of [other, latest]) if (!it.flags.includes('CONTRADICTION')) { it.flags.push('CONTRADICTION'); it.state = 'FLAGGED' }
    }
  }

  const d = decide(state, flags, yielded)
  state = d.state
  state = { ...state, evidence_ids: prior.items.map((i) => i.id) }

  prior.extractor = 'runtime'
  prior.extractor_version = EXTRACTOR_VERSION
  prior.source_revision = interview.revision ?? 0
  prior.extracted_at = Date.now()
  prior.dropped_unanchored = dropped
  await evidenceStore().put(prior)

  const topic = activeTopic(state)
  const reply = await realize(
    realizeInstruction(d.move, d.detail, topic?.label ?? null, interview.participant),
    realizeContext(messages),
  )

  return {
    reply,
    runtime: state,
    closing: state.conversation === 'CLOSING' || state.conversation === 'CLOSED',
    evidence_count: prior.items.length,
  }
}

function emptyEnvelope(interviewId: string, _state: RuntimeState): EvidenceEnvelope {
  return {
    interview_id: interviewId,
    extractor: 'runtime',
    extractor_version: EXTRACTOR_VERSION,
    source_revision: 0,
    extracted_at: Date.now(),
    items: [], pointers: [], gaps: [], contradictions: [],
    dropped_unanchored: 0,
  }
}
