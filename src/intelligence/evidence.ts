// Evidence Layer domain model — Milestone 1 of the Intelligence Layer roadmap.
//
// Shapes transcribe CYRA_INTERVIEW_ENGINE_RUNTIME.md §11 (EvidenceItem, routing,
// forbidden extractions) and §12 (deterministic capped confidence), plus the
// §14.4 handoff containers (gaps, pointers, contradictions). The Intelligence
// Layer (§0) consumes exactly this: evidence with provenance, confidence,
// contradictions, and gaps.
//
// Two rules this module enforces IN CODE, not in prompts:
//   1. Confidence is DERIVED from typed flags (§12) — never asserted by a model
//      and hard-capped at MODERATE within a single interview (Constitution P4).
//   2. The model's only job is perception: quotes and typed flags. Register
//      splitting, routing, person-evaluation refusal and confidence all happen
//      deterministically here (§0.1's judgment/control split, applied to the
//      retrofit extractor before the M2 engine exists).

// ---------- Enums (Runtime §4 / §11.1 — closed sets; never extended ad hoc) ----------

export type Register = 'ESPOUSED' | 'ENACTED'
export type PerceivedRegister = Register | 'MIXED' | 'NONE'
export type SourceQuality = 'FIRST_HAND' | 'HEARSAY' | 'SPECULATION' | 'NONE'
export type Specificity = 'DATED_INCIDENT' | 'RECENT_INSTANCE' | 'GENERAL' | 'NONE'
export type Richness = 'RICH' | 'THIN'
export type EntityKind =
  | 'PROCESS' | 'DECISION' | 'CONSTRAINT' | 'KNOWLEDGE'
  | 'RELATIONSHIP' | 'INCIDENT' | 'CAPABILITY' | 'GAP'
export type Routing = 'CONTENT' | 'POINTER'
export type Elicitation = 'SPONTANEOUS' | 'PROMPTED' | 'LEADING'
export type ConfidenceBand = 'NONE' | 'LOW' | 'MODERATE' // §12.2 — MODERATE is the single-interview ceiling
export type EvidenceFlag = 'HEARSAY' | 'SELF_SERVING_UNVERIFIABLE' | 'CONTRADICTION' | 'LEADING_ELICITED'
export type ItemState = 'RAW' | 'ANCHORED' | 'ROUTED' | 'CONFIDENCE_SET' | 'FLAGGED'

/** Perception output for one candidate item (§4 subset relevant to extraction).
 *  The model emits ONLY this; everything downstream is deterministic. */
export interface PerceivedCandidate {
  verbatim_anchor: string // exact words from the transcript — validated, never trusted
  interpretation: string // the engine's reading, SEPARATE from the anchor (§11.2)
  entity: EntityKind
  register: PerceivedRegister
  source_quality: SourceQuality
  specificity: Specificity
  richness: Richness
  against_interest: boolean
  self_serving: boolean
  verifiable: boolean
  internally_consistent: boolean // consistent with the rest of this transcript
  sig_recall_exhausted: boolean
  sig_inarticulable: boolean // "I just know / you get a feel" → POINTER routing
  sig_relational: boolean // names another holder → POINTER routing
  sig_third_party_eval: boolean // judging a NAMED individual → forbidden (§11.6, I7)
  sig_sensitive: boolean // do-not-surface territory → forbidden (§11.6)
  /** Present when the anchor names who/where knowledge lives (feeds PointerItem). */
  pointer_holder?: string
  turn_index: number // index into interview.messages of the anchored utterance
}

export interface EvidenceItem {
  id: string
  verbatim_anchor: string
  interpretation: string
  entity: EntityKind
  register: Register // MIXED is split before storage (§11.3); never stored blurred
  source_quality: Exclude<SourceQuality, 'NONE'>
  routing: Routing
  provenance: {
    interview_id: string // personId — interviews are keyed by person
    role: string // participant designation (never the name — P6 aggregation)
    turn_index: number
    elicitation: Elicitation
  }
  confidence: ConfidenceBand
  confidence_rationale: string // §12.3 — every band carries its derivation
  flags: EvidenceFlag[]
  state: ItemState
}

export interface PointerItem {
  id: string
  holder: string
  conditions: string
  how_to_reach: string
  anchor: string
}

export interface GapItem {
  id: string
  description: string
  source: 'UNANSWERED' | 'LOW_COVERAGE' | 'EXTRACTION'
}

export interface ContradictionFlag {
  id: string
  item_a: string // EvidenceItem ids — both sides preserved (§13.3; no overwrite)
  item_b: string
  note: string
  resolved: false // in-interview resolution is forbidden; upward-passing only
}

/** The per-interview envelope the store persists. Derived data: regenerating it
 *  from the transcript is always safe; the transcript remains the source of truth. */
export interface EvidenceEnvelope {
  interview_id: string
  extractor: 'model' | 'heuristic' | 'runtime'
  extractor_version: string
  source_revision: number // interview.revision the extraction was computed from
  extracted_at: number
  items: EvidenceItem[]
  pointers: PointerItem[]
  gaps: GapItem[]
  contradictions: ContradictionFlag[]
  dropped_unanchored: number // candidates rejected because their anchor was not verbatim
}

// ---------- §12 — deterministic, capped confidence ----------

export interface ConfidenceInput {
  source_quality: SourceQuality
  specificity: Specificity
  richness: Richness
  against_interest: boolean
  self_serving: boolean
  verifiable: boolean
  internally_consistent: boolean
  register: Register
  elicitation: Elicitation
  sig_recall_exhausted: boolean
}

export function deriveConfidence(c: ConfidenceInput): {
  band: ConfidenceBand
  rationale: string
  flags: EvidenceFlag[]
} {
  const flags: EvidenceFlag[] = []
  const parts: string[] = []
  let score = c.source_quality === 'FIRST_HAND' ? 2 : 0
  parts.push(`base ${c.source_quality}=${score}`)

  const add = (cond: boolean, delta: number, label: string) => {
    if (!cond) return
    score += delta
    parts.push(`${delta > 0 ? '+' : ''}${delta} ${label}`)
  }
  add(c.specificity === 'DATED_INCIDENT' || c.specificity === 'RECENT_INSTANCE', 1, 'specific instance')
  add(c.richness === 'RICH', 1, 'rich detail')
  add(c.against_interest, 1, 'against interest')
  add(c.internally_consistent, 1, 'consistent with buffer')
  add(c.register === 'ESPOUSED' && c.specificity === 'GENERAL', -1, 'espoused+general')
  if (c.self_serving && !c.verifiable) {
    score -= 1
    parts.push('-1 self-serving unverifiable')
    flags.push('SELF_SERVING_UNVERIFIABLE')
  }
  if (c.elicitation === 'LEADING') {
    score -= 1
    parts.push('-1 leading-elicited')
    flags.push('LEADING_ELICITED')
  }
  add(c.sig_recall_exhausted, -1, 'recall exhausted')

  if (c.source_quality === 'HEARSAY') flags.push('HEARSAY')

  score = Math.max(0, Math.min(4, score))
  // §12.2 — score ≥ 2 maps to MODERATE, the hard single-interview ceiling.
  const band: ConfidenceBand = score === 0 ? 'NONE' : score === 1 ? 'LOW' : 'MODERATE'
  return { band, rationale: `${parts.join(', ')} → ${score} → ${band}`, flags }
}

// ---------- §11 — deterministic extraction over perceived candidates ----------

let evidenceCounter = 0
const evidenceId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(evidenceCounter++).toString(36)}`

/** Locate an anchor verbatim in the transcript text. The model is never trusted
 *  on this: an anchor that does not appear word-for-word disqualifies the item
 *  (fabricated or paraphrased quotes must not enter the evidence base). */
export function anchorResolves(anchor: string, transcriptText: string): boolean {
  const a = anchor.trim()
  return a.length >= 8 && transcriptText.includes(a)
}

/** §11.6 — forbidden extractions. Returns true when the candidate must not
 *  become an evidence item at all. */
export function isForbidden(c: PerceivedCandidate): boolean {
  return c.sig_sensitive || (c.sig_third_party_eval && c.entity !== 'PROCESS' && c.entity !== 'CONSTRAINT' && c.entity !== 'RELATIONSHIP')
}

/** Deterministic §11 pipeline for one perceived candidate:
 *  forbidden-filter → register split (MIXED ⇒ two items) → routing → §12
 *  confidence → state. Returns zero, one, or two items plus optional pointer. */
export function realizeCandidate(
  c: PerceivedCandidate,
  transcriptText: string,
  interviewId: string,
  role: string,
): { items: EvidenceItem[]; pointer: PointerItem | null; droppedUnanchored: boolean } {
  if (!anchorResolves(c.verbatim_anchor, transcriptText)) {
    return { items: [], pointer: null, droppedUnanchored: true }
  }
  if (isForbidden(c)) return { items: [], pointer: null, droppedUnanchored: false }
  if (c.register === 'NONE' || c.source_quality === 'NONE') return { items: [], pointer: null, droppedUnanchored: false }

  const routing: Routing = c.sig_inarticulable || c.sig_relational ? 'POINTER' : 'CONTENT'
  const pointer: PointerItem | null = routing === 'POINTER'
    ? {
        id: evidenceId('ptr'),
        holder: c.pointer_holder?.trim() || 'unnamed holder',
        conditions: c.interpretation,
        how_to_reach: '',
        anchor: c.verbatim_anchor,
      }
    : null

  // §11.3 — MIXED is split into one ESPOUSED and one ENACTED item, never blurred.
  const registers: Register[] = c.register === 'MIXED' ? ['ESPOUSED', 'ENACTED'] : [c.register]
  const items = registers.map((register): EvidenceItem => {
    const conf = deriveConfidence({ ...c, register, source_quality: c.source_quality, elicitation: 'PROMPTED' })
    return {
      id: evidenceId('ev'),
      verbatim_anchor: c.verbatim_anchor.trim(),
      interpretation: c.interpretation,
      entity: c.entity,
      register,
      source_quality: c.source_quality as Exclude<SourceQuality, 'NONE'>,
      routing,
      provenance: {
        interview_id: interviewId,
        role,
        turn_index: c.turn_index,
        // The retrofit extractor works from an interview conducted by the
        // legacy engine: every utterance was a response to a question, so
        // PROMPTED is the honest blanket value. SPONTANEOUS/LEADING become
        // meaningful when the M2 runtime logs elicitation per turn.
        elicitation: 'PROMPTED',
      },
      confidence: conf.band,
      confidence_rationale: conf.rationale,
      flags: conf.flags,
      state: 'CONFIDENCE_SET',
    }
  })
  return { items, pointer, droppedUnanchored: false }
}
