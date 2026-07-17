// Evidence extraction — background function (Milestone 1).
//
// Runs AFTER an interview, entirely server-side: zero participant-flow risk.
// Perception is the only model-assisted step; anchor validation, register
// splitting, routing, forbidden-extraction guards and confidence are the
// deterministic §11/§12 pipeline in src/intelligence/evidence.ts. If the model
// is unreachable, the heuristic extractor keeps the contract (two engines, one
// contract — extraction edition). Envelopes are derived data: re-running is
// always safe; the transcript remains the source of truth.

import Anthropic from '@anthropic-ai/sdk'
import type { Interview } from '../../src/types.ts'
import {
  realizeCandidate, type ContradictionFlag, type EvidenceEnvelope,
  type EvidenceItem, type GapItem, type PerceivedCandidate, type PointerItem,
} from '../../src/intelligence/evidence.ts'
import {
  EXTRACTION_SCHEMA, EXTRACTION_SYSTEM, EXTRACTOR_VERSION,
  heuristicCandidates, participantTextFor, transcriptFor,
} from '../../src/intelligence/extraction.ts'
import { getInterview } from './_store.mts'
import { evidenceStore } from './_evidence-store.mts'

const MODEL = 'claude-opus-4-8'

async function perceive(interview: Interview): Promise<{ candidates: PerceivedCandidate[]; extractor: 'model' | 'heuristic' }> {
  const apiKey = Netlify.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return { candidates: heuristicCandidates(interview), extractor: 'heuristic' }
  try {
    const client = new Anthropic({ apiKey })
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      system: EXTRACTION_SYSTEM,
      messages: [{ role: 'user', content: `TRANSCRIPT (turn indices in brackets):\n\n${transcriptFor(interview)}\n\nEmit the candidate evidence items now.` }],
      output_config: { format: { type: 'json_schema', schema: EXTRACTION_SCHEMA } },
    })
    const r = await stream.finalMessage()
    if (r.stop_reason === 'refusal') throw new Error('perception refused')
    const text = r.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('')
    const parsed = JSON.parse(text) as { candidates: PerceivedCandidate[] }
    return { candidates: parsed.candidates ?? [], extractor: 'model' }
  } catch {
    return { candidates: heuristicCandidates(interview), extractor: 'heuristic' }
  }
}

export default async (req: Request) => {
  const { personId } = await req.json()
  const interview = (await getInterview(personId)) as Interview | null
  if (!interview) return new Response('no such interview', { status: 404 })
  if (interview.messages.length === 0) return new Response('nothing to extract', { status: 200 })

  const { candidates, extractor } = await perceive(interview)

  // Deterministic realization (§11/§12) — anchors verified against what the
  // participant actually said; unverifiable candidates are dropped and counted.
  const participantText = participantTextFor(interview)
  const role = interview.participant?.designation || 'participant'
  const items: EvidenceItem[] = []
  const pointers: PointerItem[] = []
  let dropped = 0
  for (const c of candidates) {
    const r = realizeCandidate(c, participantText, personId, role)
    items.push(...r.items)
    if (r.pointer) pointers.push(r.pointer)
    if (r.droppedUnanchored) dropped++
  }

  // Within-interview contradiction seeds (§13 detection only — resolution is
  // upward-passed, never done here): register mismatch on the same entity.
  const contradictions: ContradictionFlag[] = []
  for (const a of items) {
    for (const b of items) {
      if (a.id >= b.id) continue
      if (a.entity === b.entity && a.register !== b.register && a.provenance.turn_index !== b.provenance.turn_index) {
        contradictions.push({
          id: `ct-${a.id}-${b.id}`,
          item_a: a.id, item_b: b.id,
          note: `espoused/enacted divergence on ${a.entity}`,
          resolved: false,
        })
        break
      }
    }
  }
  for (const c of contradictions) {
    for (const it of items) {
      if ((it.id === c.item_a || it.id === c.item_b) && !it.flags.includes('CONTRADICTION')) {
        it.flags.push('CONTRADICTION')
        it.state = 'FLAGGED'
      }
    }
  }

  // Gap register seed: the legacy report's own unanswered questions, plus
  // dimensions the interview itself scored thin.
  const gaps: GapItem[] = [
    ...(interview.report?.unanswered ?? []).map((u, i) => ({
      id: `gap-u${i}`, description: u, source: 'UNANSWERED' as const,
    })),
    ...Object.entries(interview.coverage)
      .filter(([, v]) => v < 0.3)
      .map(([k]) => ({ id: `gap-c-${k}`, description: `Dimension "${k}" thinly covered in this interview`, source: 'LOW_COVERAGE' as const })),
  ]

  const envelope: EvidenceEnvelope = {
    interview_id: personId,
    extractor,
    extractor_version: EXTRACTOR_VERSION,
    source_revision: interview.revision ?? 0,
    extracted_at: Date.now(),
    items, pointers, gaps, contradictions,
    dropped_unanchored: dropped,
  }
  await evidenceStore().put(envelope)
  return new Response('ok')
}
