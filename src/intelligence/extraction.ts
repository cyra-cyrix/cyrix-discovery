// Evidence extraction — perception prompt + schema (model side) and the
// heuristic fallback (offline side). Two extractors, one contract: both emit
// PerceivedCandidate[], and everything after perception is the deterministic
// §11/§12 pipeline in evidence.ts. The model never assigns confidence.

import type { Interview } from '../types'
import type { PerceivedCandidate } from './evidence'

export const EXTRACTOR_VERSION = 'm1.1'

/** Transcript rendered with turn indices so anchors can cite their utterance. */
export function transcriptFor(interview: Interview): string {
  return interview.messages
    .map((m, i) => `[${i}] ${m.role === 'ai' ? 'CONSULTANT' : 'PARTICIPANT'}: ${m.text}`)
    .join('\n')
}

/** Plain participant text — the surface anchors must verbatim-resolve against. */
export function participantTextFor(interview: Interview): string {
  return interview.messages.filter((m) => m.role === 'user').map((m) => m.text).join('\n')
}

export const EXTRACTION_SYSTEM = `You are the evidence-perception stage of an organizational discovery platform. You read one interview transcript and emit candidate evidence items as typed perceptions. You do NOT judge importance, do NOT assign confidence, do NOT recommend anything — a deterministic layer downstream does all of that.

Rules, each binding:
- verbatim_anchor MUST be an exact, contiguous quote from a PARTICIPANT utterance — copied character-for-character, minimum 8 characters. Never paraphrase, never stitch two passages, never quote the consultant. Items whose anchor is not verbatim are discarded downstream, so a beautiful paraphrase is worthless.
- interpretation is YOUR reading of what the anchor evidences, kept separate from the quote.
- register: ESPOUSED = how things are supposed to work (policy, SOP, "we should"); ENACTED = what actually happens (specific practice, incidents, workarounds); MIXED only when one anchor genuinely carries both.
- source_quality: FIRST_HAND only for the speaker's own experience; HEARSAY when they relay others' accounts; SPECULATION for guesses about how things might be.
- Set sig_third_party_eval=true whenever the anchor evaluates a NAMED individual's competence or character. Set sig_sensitive=true for personal/HR territory. Do not suppress the candidate — flag it; the downstream layer enforces what may be stored.
- sig_inarticulable ("you just get a feel for it") and sig_relational ("ask Suresh", "the register lives with the clerk") mark knowledge POINTERS; name the holder in pointer_holder when stated.
- turn_index is the [n] of the participant utterance the anchor comes from.
- Emit every distinct evidenced claim, including small ones. Omit pleasantries and content-free turns. Never invent a claim the transcript does not contain.`

export const EXTRACTION_SCHEMA = {
  type: 'object' as const,
  properties: {
    candidates: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          verbatim_anchor: { type: 'string' as const },
          interpretation: { type: 'string' as const },
          entity: { type: 'string' as const, enum: ['PROCESS', 'DECISION', 'CONSTRAINT', 'KNOWLEDGE', 'RELATIONSHIP', 'INCIDENT', 'CAPABILITY', 'GAP'] },
          register: { type: 'string' as const, enum: ['ESPOUSED', 'ENACTED', 'MIXED', 'NONE'] },
          source_quality: { type: 'string' as const, enum: ['FIRST_HAND', 'HEARSAY', 'SPECULATION', 'NONE'] },
          specificity: { type: 'string' as const, enum: ['DATED_INCIDENT', 'RECENT_INSTANCE', 'GENERAL', 'NONE'] },
          richness: { type: 'string' as const, enum: ['RICH', 'THIN'] },
          against_interest: { type: 'boolean' as const },
          self_serving: { type: 'boolean' as const },
          verifiable: { type: 'boolean' as const },
          internally_consistent: { type: 'boolean' as const },
          sig_recall_exhausted: { type: 'boolean' as const },
          sig_inarticulable: { type: 'boolean' as const },
          sig_relational: { type: 'boolean' as const },
          sig_third_party_eval: { type: 'boolean' as const },
          sig_sensitive: { type: 'boolean' as const },
          pointer_holder: { type: 'string' as const },
          turn_index: { type: 'integer' as const },
        },
        required: ['verbatim_anchor', 'interpretation', 'entity', 'register', 'source_quality', 'specificity', 'richness', 'against_interest', 'self_serving', 'verifiable', 'internally_consistent', 'sig_recall_exhausted', 'sig_inarticulable', 'sig_relational', 'sig_third_party_eval', 'sig_sensitive', 'turn_index'],
        additionalProperties: false,
      },
    },
  },
  required: ['candidates'],
  additionalProperties: false,
}

/** Offline fallback — two engines, one contract, applied to extraction. Derives
 *  conservative candidates from the facts the interview already extracted, with
 *  anchors located verbatim in participant utterances. Deliberately modest:
 *  everything it emits is honest, low-specificity, and will band LOW/MODERATE. */
export function heuristicCandidates(interview: Interview): PerceivedCandidate[] {
  const out: PerceivedCandidate[] = []
  const userTurns = interview.messages
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.role === 'user')

  for (const { m, i } of userTurns) {
    const text = m.text.trim()
    if (text.length < 12) continue
    // Anchor = the first sentence of the utterance (verbatim by construction).
    const sentence = (text.match(/[^.!?]{8,}[.!?]?/)?.[0] ?? text).trim()
    const lower = text.toLowerCase()
    const relational = /\b(ask|asks|through|goes to|only\s+\w+\s+knows|kept by|lives with)\b/.test(lower)
    const enacted = /\b(yesterday|last week|last month|this week|i did|i went|i spent|we did|happened)\b/.test(lower)
    out.push({
      verbatim_anchor: sentence,
      interpretation: `Participant account: ${sentence.slice(0, 120)}`,
      entity: relational ? 'RELATIONSHIP' : enacted ? 'INCIDENT' : 'PROCESS',
      register: enacted ? 'ENACTED' : 'ESPOUSED',
      source_quality: 'FIRST_HAND',
      specificity: enacted ? 'RECENT_INSTANCE' : 'GENERAL',
      richness: text.length > 160 ? 'RICH' : 'THIN',
      against_interest: /\b(workaround|we actually|to be honest|i skip|we skip|not supposed to)\b/.test(lower),
      self_serving: false,
      verifiable: true,
      internally_consistent: true,
      sig_recall_exhausted: /\b(don't remember|can't recall|not sure exactly)\b/.test(lower),
      sig_inarticulable: /\b(just know|get a feel|by experience|instinct)\b/.test(lower),
      sig_relational: relational,
      sig_third_party_eval: false,
      sig_sensitive: false,
      turn_index: i,
    })
  }
  return out
}
