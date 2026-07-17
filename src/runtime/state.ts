// Runtime §1 (the blackboard) and §4 (the typed FlagSet).
//
// The state object is plain serializable data: it checkpoints inside
// `Interview.runtime` on the existing durability rails, so a refresh or a
// closed browser restores the engine exactly where it stopped — the same
// guarantee the conversation already has. DECISION reads and writes only
// these fields (§0.2); nothing here touches I/O, models, or the clock.

// ---------- §4 — PERCEIVE's output. Closed enums; uncertainty = NONE/false ----------

export type TrustBreachMarker = 'NONE' | 'TERSE_SHIFT' | 'ESPOUSED_RETREAT' | 'META_QUESTION' | 'DEFLECTION' | 'DISCOMFORT'

export interface FlagSet {
  register: 'ESPOUSED' | 'ENACTED' | 'MIXED' | 'NONE'
  source_quality: 'FIRST_HAND' | 'HEARSAY' | 'SPECULATION' | 'NONE'
  specificity: 'DATED_INCIDENT' | 'RECENT_INSTANCE' | 'GENERAL' | 'NONE'
  richness: 'RICH' | 'THIN'
  against_interest: boolean
  self_serving: boolean
  verifiable: boolean

  sig_generalization: boolean
  sig_vagueness: boolean
  sig_it_depends: boolean
  sig_workaround: boolean
  sig_anomaly: boolean
  sig_emotional: boolean
  sig_relational: boolean
  sig_glossed_decision: boolean
  sig_hedge: boolean

  sig_recall_exhausted: boolean
  sig_decline: boolean
  sig_third_party_eval: boolean
  sig_sensitive: boolean
  sig_inarticulable: boolean

  trust_breach_marker: TrustBreachMarker

  /** id of a buffered EvidenceItem this utterance conflicts with, else null */
  contradicts_buffer: string | null
  context_conditioned: boolean

  frame_acknowledged: boolean
}

/** The safe default: perceive-nothing. Used when PERCEIVE fails and for turns
 *  with no participant content — DECISION still runs deterministically. */
export function emptyFlags(): FlagSet {
  return {
    register: 'NONE', source_quality: 'NONE', specificity: 'NONE', richness: 'THIN',
    against_interest: false, self_serving: false, verifiable: false,
    sig_generalization: false, sig_vagueness: false, sig_it_depends: false,
    sig_workaround: false, sig_anomaly: false, sig_emotional: false,
    sig_relational: false, sig_glossed_decision: false, sig_hedge: false,
    sig_recall_exhausted: false, sig_decline: false, sig_third_party_eval: false,
    sig_sensitive: false, sig_inarticulable: false,
    trust_breach_marker: 'NONE', contradicts_buffer: null,
    context_conditioned: false, frame_acknowledged: false,
  }
}

// ---------- §1 — working state ----------

export type ConversationState = 'FRAMING' | 'ORIENTING' | 'EXPLORING' | 'DEEPENING' | 'GAP_TESTING' | 'REPAIRING' | 'CLOSING' | 'CLOSED'
export type TrustState = 'SAFE' | 'GUARDED' | 'BREACHED'
export type TopicState = 'UNOPENED' | 'OPENED' | 'SURFACE' | 'ENACTED' | 'DEEP' | 'SATURATED' | 'PARKED_SENSITIVE'

/** §9 leaf moves + control moves. The dispatcher returns exactly one per turn. */
export type Move =
  | 'FRAME_STATEMENT' | 'REPAIR_MOVE' | 'ACKNOWLEDGE_AND_ADVANCE' | 'REDIRECT_MOVE'
  | 'CONTRADICTION_MOVE' | 'ANCHOR' | 'POINTER_CAPTURE' | 'CDM_DEEPEN'
  | 'DECISION_RULE_PROBE' | 'DECISION_BASIS_PROBE' | 'MECHANICS_PROBE'
  | 'CONSTRAINT_PROBE' | 'CLARIFY' | 'LADDER_DOWN'
  | 'GAP_TEST' | 'NEXT_TOPIC' | 'OPEN_NEXT_TOPIC' | 'ORIENT'
  | 'MEMBER_CHECK' | 'CAPTURE_MISS' | 'CAPTURE_POINTERS' | 'SAFE_CLOSE'

/** CDM passes in order (§9 CDM_DEEPEN): timeline→cues→options/basis→counterfactual. */
export const CDM_PASSES = ['timeline', 'cues', 'options_basis', 'counterfactual'] as const
export type CdmPass = (typeof CDM_PASSES)[number]

export interface TopicRecord {
  id: string
  label: string // participant-terms label; used by REALIZE, never imported framing
  state: TopicState
  priority: number
  empty_probes: number
  is_hypothesis: boolean
  cdm_done: CdmPass[]
  /** espoused/enacted counterpart seen? drives GAP_TEST (§8 guard 10) */
  espoused_seen: boolean
  enacted_seen: boolean
  gap_tested: boolean
}

export interface LogEntry {
  turn: number
  matched_guard: string // e.g. "1-SAFETY", "6-ANCHOR", "9-PROBE/MECHANICS_PROBE"
  move: Move
  conversation: ConversationState
  trust: TrustState
  active_topic: string | null
  note: string
}

export interface RuntimeState {
  conversation: ConversationState
  trust: TrustState
  turn_index: number
  topics: TopicRecord[] // ordered; active = first with active_id match
  active_topic_id: string | null
  evidence_ids: string[] // items extracted this interview (stored in the envelope)
  open_gap_count: number
  pointer_count: number
  contradiction_count: number
  recent_breaches: TrustBreachMarker[] // ring buffer, max WINDOW
  cooperative_streak: number // consecutive cooperative turns (repair clearing)
  breach_streak: number // consecutive breach turns while GUARDED
  soft_breach_count: number // TERSE_SHIFT/ESPOUSED_RETREAT accumulation (§5.1)
  last_move: Move | null
  leading_count: number
  fatigue_score: number
  saturation_streak: number
  closing_step: 0 | 1 | 2 | 3 | 4 // §14.3 progress: member_check→miss→pointers→safe_close→closed
  repair_offer_made: boolean
  decision_log: LogEntry[]
}

/** Topic seed derived from the 10 discovery dimensions + orienting topics.
 *  Priors (§15) may only adjust priority / set is_hypothesis — never wording. */
export interface TopicSeed {
  id: string
  label: string
  priority: number
  is_hypothesis?: boolean
}

export function initRuntimeState(seeds: TopicSeed[]): RuntimeState {
  return {
    conversation: 'FRAMING',
    trust: 'GUARDED', // §3 INIT
    turn_index: 0,
    topics: seeds.map((s) => ({
      id: s.id, label: s.label, state: 'UNOPENED',
      priority: s.priority, empty_probes: 0,
      is_hypothesis: s.is_hypothesis ?? false,
      cdm_done: [], espoused_seen: false, enacted_seen: false, gap_tested: false,
    })),
    active_topic_id: null,
    evidence_ids: [],
    open_gap_count: 0,
    pointer_count: 0,
    contradiction_count: 0,
    recent_breaches: [],
    cooperative_streak: 0,
    breach_streak: 0,
    soft_breach_count: 0,
    last_move: null,
    leading_count: 0,
    fatigue_score: 0,
    saturation_streak: 0,
    closing_step: 0,
    repair_offer_made: false,
    decision_log: [],
  }
}

export function activeTopic(state: RuntimeState): TopicRecord | null {
  return state.topics.find((t) => t.id === state.active_topic_id) ?? null
}
