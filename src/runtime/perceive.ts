// PERCEIVE — the first of exactly two model-assisted steps (§0.1). One bounded
// call per turn emitting (a) the §4 FlagSet for DECISION and (b) evidence
// candidates for the deterministic §11 EXTRACT. It may only emit declared enum
// values; uncertainty is NONE/false, never a guess (§4).

import type { FlagSet } from './state'
import type { PerceivedCandidate } from '../intelligence/evidence'

export interface Perception {
  flags: FlagSet
  candidates: PerceivedCandidate[]
}

export const PERCEIVE_SYSTEM = `You are the PERCEPTION stage of a deterministic interview engine. You read the participant's latest utterance in context and emit ONLY typed flags and evidence candidates. You never decide what to do next, never write questions, never judge importance, never assign confidence. A deterministic layer consumes your output.

Binding rules:
- Emit only the declared enum values. When uncertain, emit NONE/false — never guess outside the enum.
- flags describe the LATEST participant utterance: register (ESPOUSED=how it's supposed to work; ENACTED=what actually happened; MIXED=both in one utterance), source_quality, specificity, richness, and the signal booleans (generalization, vagueness, it-depends, workaround, anomaly, emotional, relational, glossed decision, hedge, recall exhausted, decline, third-party evaluation of a NAMED individual, sensitive/personal territory, inarticulable "you just get a feel").
- trust_breach_marker: TERSE_SHIFT (sudden shortness), ESPOUSED_RETREAT (retreat to official language), META_QUESTION ("who sees this?"), DEFLECTION, DISCOMFORT — else NONE.
- contradicts_buffer: if the utterance conflicts with a listed prior evidence item, give that item's id; if the difference is context-conditioned ("in unit A yes, unit B no") set context_conditioned=true instead.
- frame_acknowledged: true only if the participant has accepted the interview frame (consent/readiness), explicitly or by cooperatively answering.
- candidates: evidence items in this utterance. verbatim_anchor MUST be an exact contiguous quote (≥8 chars) from the utterance — paraphrase disqualifies. Interpretation separate. Flag person-evaluations and sensitive content rather than suppressing them; the deterministic layer enforces what may be stored. turn_index = the utterance's index as given.`

/** JSON schema for the perception call. Flags flattened for strictness. */
export const PERCEIVE_SCHEMA = {
  type: 'object' as const,
  properties: {
    flags: {
      type: 'object' as const,
      properties: {
        register: { type: 'string' as const, enum: ['ESPOUSED', 'ENACTED', 'MIXED', 'NONE'] },
        source_quality: { type: 'string' as const, enum: ['FIRST_HAND', 'HEARSAY', 'SPECULATION', 'NONE'] },
        specificity: { type: 'string' as const, enum: ['DATED_INCIDENT', 'RECENT_INSTANCE', 'GENERAL', 'NONE'] },
        richness: { type: 'string' as const, enum: ['RICH', 'THIN'] },
        against_interest: { type: 'boolean' as const },
        self_serving: { type: 'boolean' as const },
        verifiable: { type: 'boolean' as const },
        sig_generalization: { type: 'boolean' as const },
        sig_vagueness: { type: 'boolean' as const },
        sig_it_depends: { type: 'boolean' as const },
        sig_workaround: { type: 'boolean' as const },
        sig_anomaly: { type: 'boolean' as const },
        sig_emotional: { type: 'boolean' as const },
        sig_relational: { type: 'boolean' as const },
        sig_glossed_decision: { type: 'boolean' as const },
        sig_hedge: { type: 'boolean' as const },
        sig_recall_exhausted: { type: 'boolean' as const },
        sig_decline: { type: 'boolean' as const },
        sig_third_party_eval: { type: 'boolean' as const },
        sig_sensitive: { type: 'boolean' as const },
        sig_inarticulable: { type: 'boolean' as const },
        trust_breach_marker: { type: 'string' as const, enum: ['NONE', 'TERSE_SHIFT', 'ESPOUSED_RETREAT', 'META_QUESTION', 'DEFLECTION', 'DISCOMFORT'] },
        contradicts_buffer: { type: 'string' as const },
        has_contradiction: { type: 'boolean' as const },
        context_conditioned: { type: 'boolean' as const },
        frame_acknowledged: { type: 'boolean' as const },
      },
      required: ['register', 'source_quality', 'specificity', 'richness', 'against_interest', 'self_serving', 'verifiable', 'sig_generalization', 'sig_vagueness', 'sig_it_depends', 'sig_workaround', 'sig_anomaly', 'sig_emotional', 'sig_relational', 'sig_glossed_decision', 'sig_hedge', 'sig_recall_exhausted', 'sig_decline', 'sig_third_party_eval', 'sig_sensitive', 'sig_inarticulable', 'trust_breach_marker', 'has_contradiction', 'context_conditioned', 'frame_acknowledged'],
      additionalProperties: false,
    },
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
  required: ['flags', 'candidates'],
  additionalProperties: false,
}

/** User-message body for the perception call: last exchange + evidence buffer
 *  one-liners (for contradiction reference) — bounded, never the whole world. */
export function perceiveInput(
  lastQuestion: string,
  utterance: string,
  utteranceIndex: number,
  bufferSummaries: Array<{ id: string; line: string }>,
): string {
  const buffer = bufferSummaries.length
    ? `PRIOR EVIDENCE (id: interpretation) — reference an id in contradicts_buffer only on genuine conflict:\n${bufferSummaries.map((b) => `${b.id}: ${b.line}`).join('\n')}\n\n`
    : ''
  return `${buffer}ENGINE'S LAST QUESTION:\n${lastQuestion}\n\nPARTICIPANT UTTERANCE [index ${utteranceIndex}]:\n${utterance}\n\nEmit flags and candidates now.`
}
