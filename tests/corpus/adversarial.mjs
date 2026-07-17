// PERMANENT adversarial regression corpus for the Runtime DECISION core.
// Each scenario is a scripted sequence of §4 FlagSets (the exact boundary the
// core consumes) plus assertable expectations. Runs in `npm test` forever —
// any engine change that breaks an edge case fails CI, not a participant.
//
// `turns`: partial FlagSets merged over emptyFlags(). `yields` (optional,
// per-turn) marks turns that produced evidence. Expectations:
//   endState        — final conversation state after the script
//   endTrust        — final trust state
//   mustInclude     — moves that must appear, in order (subsequence match)
//   mustNotInclude  — moves that must never appear
//   afterTurn       — { turn, forbidden: [...] } moves forbidden from that turn on
//   maxProbesOnTopic— cap on consecutive probe moves (anti-over-probing)

const ANSWER = { register: 'ENACTED', source_quality: 'FIRST_HAND', specificity: 'RECENT_INSTANCE', richness: 'RICH', verifiable: true }
const VAGUE = { register: 'ESPOUSED', source_quality: 'FIRST_HAND', specificity: 'GENERAL', richness: 'THIN', sig_vagueness: true }
const OPEN = [{ frame_acknowledged: true }, { ...ANSWER }] // framing ack + orienting answer

export const SCENARIOS = [
  {
    name: 'trust-hard-breach-then-recovery',
    turns: [...OPEN, { ...ANSWER }, { ...ANSWER, trust_breach_marker: 'META_QUESTION' }, { ...ANSWER }, { ...ANSWER }, { ...ANSWER }],
    expect: { endTrust: 'SAFE', mustInclude: ['REPAIR_MOVE'] },
  },
  {
    name: 'trust-breach-persistent-graceful-close',
    turns: [...OPEN, { ...ANSWER, trust_breach_marker: 'DEFLECTION' }, { trust_breach_marker: 'DEFLECTION', richness: 'THIN' }, { trust_breach_marker: 'DEFLECTION', richness: 'THIN' }, { trust_breach_marker: 'DEFLECTION', richness: 'THIN' }, {}, {}, {}, {}],
    expect: { endState: 'CLOSED', endTrust: 'BREACHED', mustInclude: ['REPAIR_MOVE', 'MEMBER_CHECK', 'SAFE_CLOSE'], afterTurn: { turn: 3, forbidden: ['CDM_DEEPEN', 'ANCHOR', 'LADDER_DOWN', 'MECHANICS_PROBE'] } },
  },
  {
    name: 'trust-soft-breach-accumulates',
    turns: [...OPEN, { ...ANSWER, trust_breach_marker: 'TERSE_SHIFT' }, { ...ANSWER, trust_breach_marker: 'ESPOUSED_RETREAT' }],
    expect: { endTrust: 'GUARDED', mustInclude: ['REPAIR_MOVE'] },
  },
  {
    name: 'decline-honored-no-penalty',
    turns: [...OPEN, { ...ANSWER }, { sig_decline: true }],
    expect: { endTrust: 'SAFE', mustInclude: ['ACKNOWLEDGE_AND_ADVANCE'], mustNotInclude: ['REPAIR_MOVE'] },
  },
  {
    name: 'decline-everything-never-traps',
    turns: [...OPEN, ...Array.from({ length: 12 }, () => ({ sig_decline: true }))],
    expect: { endState: 'CLOSED', endTrust: 'SAFE', mustInclude: ['ACKNOWLEDGE_AND_ADVANCE', 'SAFE_CLOSE'] },
  },
  {
    name: 'sensitive-topic-parked-never-probed',
    turns: [...OPEN, { ...ANSWER, sig_sensitive: true }, { ...ANSWER }],
    expect: { mustInclude: ['REDIRECT_MOVE'], mustNotInclude: [] },
    check: (states) => {
      const parked = states.at(-1).topics.some((t) => t.state === 'PARKED_SENSITIVE')
      return parked ? null : 'sensitive topic was not parked'
    },
  },
  {
    name: 'third-party-eval-redirected',
    turns: [...OPEN, { ...ANSWER, sig_third_party_eval: true, sig_workaround: true }],
    expect: { mustInclude: ['REDIRECT_MOVE'], mustNotInclude: ['CDM_DEEPEN'] },
  },
  {
    name: 'contradiction-gentle-reconciliation',
    turns: [...OPEN, { ...ANSWER }, { ...ANSWER, contradicts_buffer: 'ev-x' }],
    expect: { mustInclude: ['CONTRADICTION_MOVE'] },
  },
  {
    name: 'conditioned-account-is-not-contradiction',
    turns: [...OPEN, { ...ANSWER }, { ...ANSWER, contradicts_buffer: 'ev-x', context_conditioned: true }],
    expect: { mustNotInclude: ['CONTRADICTION_MOVE'] },
  },
  {
    name: 'vague-participant-probed-then-released',
    turns: [...OPEN, { ...VAGUE }, { ...VAGUE }, { ...VAGUE }, { ...VAGUE }, { ...VAGUE }, { ...VAGUE }],
    yields: [true, true, false, false, false, false, false, false],
    expect: { mustInclude: ['ANCHOR'], maxConsecutiveProbes: 4 },
  },
  {
    name: 'it-depends-gets-decision-rule-probe',
    turns: [...OPEN, { ...ANSWER }, { ...ANSWER, sig_it_depends: true }],
    expect: { mustInclude: ['DECISION_RULE_PROBE'] },
  },
  {
    name: 'glossed-decision-gets-basis-probe',
    turns: [...OPEN, { ...ANSWER }, { ...ANSWER, sig_glossed_decision: true }],
    expect: { mustInclude: ['DECISION_BASIS_PROBE'] },
  },
  {
    name: 'emotion-gets-constraint-probe',
    turns: [...OPEN, { ...ANSWER }, { ...ANSWER, sig_emotional: true }],
    expect: { mustInclude: ['CONSTRAINT_PROBE'] },
  },
  {
    name: 'inarticulable-becomes-pointer',
    turns: [...OPEN, { ...ANSWER }, { ...ANSWER, sig_inarticulable: true }],
    expect: { mustInclude: ['POINTER_CAPTURE'] },
  },
  {
    name: 'relational-becomes-pointer',
    turns: [...OPEN, { ...ANSWER }, { ...ANSWER, sig_relational: true }],
    expect: { mustInclude: ['POINTER_CAPTURE'] },
  },
  {
    name: 'workaround-runs-full-cdm-ladder',
    turns: [...OPEN, { ...ANSWER }, { ...ANSWER, sig_workaround: true }, { ...ANSWER, sig_workaround: true }, { ...ANSWER, sig_workaround: true }, { ...ANSWER, sig_workaround: true }, { ...ANSWER }],
    expect: { mustInclude: ['CDM_DEEPEN', 'CDM_DEEPEN', 'CDM_DEEPEN', 'CDM_DEEPEN'] },
    check: (states) => (states.at(-1).topics.some((t) => t.state === 'DEEP') ? null : 'no topic reached DEEP'),
  },
  {
    name: 'recall-exhausted-suppresses-probe',
    turns: [...OPEN, { ...ANSWER }, { ...VAGUE, sig_recall_exhausted: true }],
    expect: { mustNotInclude: ['MECHANICS_PROBE', 'LADDER_DOWN', 'CLARIFY'] },
  },
  {
    name: 'fatigue-forces-graceful-close',
    turns: [...OPEN, ...Array.from({ length: 12 }, () => ({ richness: 'THIN' }))],
    expect: { endState: 'CLOSED', mustInclude: ['MEMBER_CHECK', 'CAPTURE_MISS', 'CAPTURE_POINTERS', 'SAFE_CLOSE'] },
  },
  {
    name: 'perception-failure-empty-flags-stays-sane',
    turns: [...OPEN, {}, {}, { ...ANSWER }, {}, { ...ANSWER }],
    expect: { mustNotInclude: [] }, // pure liveness: one move per turn, no crash — asserted by the runner
  },
  {
    name: 'hedge-gets-clarify',
    turns: [...OPEN, { ...ANSWER }, { ...ANSWER, sig_hedge: true }],
    expect: { mustInclude: ['CLARIFY'] },
  },
  {
    name: 'espoused-only-topic-gets-gap-test',
    turns: [...OPEN, { register: 'ESPOUSED', source_quality: 'FIRST_HAND', specificity: 'GENERAL', richness: 'RICH' }, { ...ANSWER }, { ...ANSWER }],
    expect: { mustInclude: ['GAP_TEST'] },
  },
  {
    name: 'frame-never-acknowledged-never-substantive',
    turns: [{}, { ...ANSWER, sig_workaround: true, frame_acknowledged: false }, {}, {}],
    expect: { endState: 'FRAMING', mustNotInclude: ['CDM_DEEPEN', 'ANCHOR', 'ORIENT', 'OPEN_NEXT_TOPIC'] },
  },
]
