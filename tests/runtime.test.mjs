// Runtime DECISION core — invariant tests (Runtime §16, I1–I12 where they live
// at the DECISION level; I4–I7 are extraction-level and covered in
// evidence.test.mjs). Every scenario drives the PURE core with synthetic flag
// sets — no model, no I/O — which is exactly what §0.2 promises makes this
// testable.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'cyra-rt-'))
const out = join(dir, 'runtime.mjs')
execSync(`npx esbuild src/runtime/decision.ts --bundle --format=esm --outfile=${out}`, { stdio: 'pipe' })
const outState = join(dir, 'state.mjs')
execSync(`npx esbuild src/runtime/state.ts --bundle --format=esm --outfile=${outState}`, { stdio: 'pipe' })
const { decide, stopProbe } = await import(out)
const { initRuntimeState, emptyFlags } = await import(outState)

const SEEDS = [
  { id: 't1-flow', label: 'how the work flows', priority: 5 },
  { id: 't2-delays', label: 'where waiting happens', priority: 4 },
  { id: 't3-knowledge', label: 'where knowledge lives', priority: 3 },
]

const F = (over = {}) => ({ ...emptyFlags(), ...over })
/** Cooperative substantive answer (frame long since acknowledged). */
const ANSWER = (over = {}) => F({ register: 'ENACTED', source_quality: 'FIRST_HAND', specificity: 'RECENT_INSTANCE', richness: 'RICH', ...over })

/** Drive: framing → orienting → exploring, returning a mid-interview state. */
function warmedUp() {
  let s = initRuntimeState(SEEDS)
  let d = decide(s, F(), false) // FRAME_STATEMENT
  assert.equal(d.move, 'FRAME_STATEMENT')
  d = decide(d.state, F({ frame_acknowledged: true }), false) // → ORIENTING
  d = decide(d.state, ANSWER(), true) // orienting answer → EXPLORING, open topic
  return d.state
}

test('I2: FRAMING emits only FRAME_STATEMENT, even against rich content flags', () => {
  const s = initRuntimeState(SEEDS)
  const d = decide(s, ANSWER({ sig_workaround: true }), true)
  assert.equal(d.move, 'FRAME_STATEMENT')
})

test('frame acknowledgment moves to ORIENTING and clears trust to SAFE', () => {
  const s = initRuntimeState(SEEDS)
  const d = decide(s, F({ frame_acknowledged: true }), false)
  assert.equal(d.state.conversation, 'ORIENTING')
  assert.equal(d.state.trust, 'SAFE')
})

test('I1/I11: every turn emits exactly one move and one log entry', () => {
  let s = initRuntimeState(SEEDS)
  const script = [F(), F({ frame_acknowledged: true }), ANSWER(), ANSWER({ sig_vagueness: true }), ANSWER({ sig_workaround: true }), F({ richness: 'THIN' })]
  for (const flags of script) {
    const before = s.decision_log.length
    const d = decide(s, flags, false)
    assert.equal(d.state.decision_log.length, before + 1)
    assert.equal(typeof d.move, 'string')
    s = d.state
  }
})

test('I3: hard trust breach forces repair; nothing substantive until cleared', () => {
  let s = warmedUp()
  let d = decide(s, ANSWER({ trust_breach_marker: 'META_QUESTION' }), false)
  assert.equal(d.state.trust, 'GUARDED')
  assert.equal(d.move, 'REPAIR_MOVE')
  // Probe-worthy content while GUARDED must still be repair-only (I3)
  d = decide(d.state, ANSWER({ sig_workaround: true, trust_breach_marker: 'DEFLECTION' }), false)
  assert.equal(d.move, 'REPAIR_MOVE')
})

test('repair success: cooperative turns clear GUARDED back to SAFE (§5.2)', () => {
  let s = warmedUp()
  let d = decide(s, ANSWER({ trust_breach_marker: 'DISCOMFORT' }), false)
  assert.equal(d.state.trust, 'GUARDED')
  d = decide(d.state, ANSWER(), true) // cooperative 1
  d = decide(d.state, ANSWER(), true) // cooperative 2 → clear
  assert.equal(d.state.trust, 'SAFE')
  assert.notEqual(d.move, 'REPAIR_MOVE')
})

test('persistent breach → BREACHED → graceful close regardless of zero coverage (§14.2)', () => {
  let s = warmedUp()
  let d = decide(s, ANSWER({ trust_breach_marker: 'DEFLECTION' }), false)
  for (let i = 0; i < 3; i++) d = decide(d.state, F({ trust_breach_marker: 'DEFLECTION', richness: 'THIN' }), false)
  assert.equal(d.state.trust, 'BREACHED')
  // closure ladder runs to SAFE_CLOSE and CLOSED
  const moves = []
  while (d.state.conversation !== 'CLOSED') {
    d = decide(d.state, F(), false)
    moves.push(d.move)
    assert.ok(moves.length < 10, 'closure must terminate')
  }
  assert.equal(moves[moves.length - 1], 'SAFE_CLOSE')
})

test('decline honored without trust penalty; topic advanced (§5.1 last row)', () => {
  const s = warmedUp()
  const d = decide(s, F({ sig_decline: true }), false)
  assert.equal(d.move, 'ACKNOWLEDGE_AND_ADVANCE')
  assert.equal(d.state.trust, 'SAFE')
})

test('I7 groundwork: person-evaluation redirects, never deepens (§8 guard 4)', () => {
  const s = warmedUp()
  const d = decide(s, ANSWER({ sig_third_party_eval: true, sig_workaround: true }), true)
  assert.equal(d.move, 'REDIRECT_MOVE')
})

test('sensitive content parks the topic (§6) and redirects (§8 guard 4)', () => {
  const s = warmedUp()
  const d = decide(s, ANSWER({ sig_sensitive: true }), false)
  assert.equal(d.move, 'REDIRECT_MOVE')
  const parked = d.state.topics.find((t) => t.id === d.state.active_topic_id)
  assert.equal(parked.state, 'PARKED_SENSITIVE')
})

test('anchor-before-deepen: SURFACE topic + strong signal still yields ANCHOR (guard 6 precedes 8)', () => {
  let s = warmedUp()
  // Espoused/general answer → topic SURFACE
  let d = decide(s, ANSWER({ register: 'ESPOUSED', specificity: 'GENERAL' }), true)
  const t = d.state.topics.find((x) => x.id === d.state.active_topic_id)
  assert.equal(t.state, 'SURFACE')
  d = decide(d.state, ANSWER({ register: 'ESPOUSED', specificity: 'GENERAL', sig_workaround: true }), true)
  assert.equal(d.move, 'ANCHOR')
})

test('CDM passes run in order and reach DEEP (§9 CDM_DEEPEN, §6)', () => {
  let s = warmedUp()
  let d = decide(s, ANSWER(), true) // ENACTED anchor lands
  const passes = []
  for (let i = 0; i < 4; i++) {
    d = decide(d.state, ANSWER({ sig_workaround: true }), true)
    assert.equal(d.move, 'CDM_DEEPEN')
    passes.push(d.detail)
  }
  assert.deepEqual(passes, ['cdm:timeline', 'cdm:cues', 'cdm:options_basis', 'cdm:counterfactual'])
  d = decide(d.state, ANSWER(), true)
  // The engine correctly ADVANCEs once the topic is DEEP — so inspect the
  // original topic by id, not whatever is now active.
  assert.equal(d.state.topics.find((x) => x.id === 't1-flow').state, 'DEEP')
  assert.equal(d.move, 'NEXT_TOPIC') // and the advance itself is the emitted move
})

test('I9: probe-warranted flags are suppressed when fatigue hits the limit', () => {
  let s = warmedUp()
  s = { ...s, fatigue_score: 99 }
  assert.equal(stopProbe(s, F({ sig_vagueness: true })), true)
  const d = decide(s, ANSWER({ sig_vagueness: true }), true)
  assert.ok(!['MECHANICS_PROBE', 'CLARIFY', 'LADDER_DOWN', 'DECISION_RULE_PROBE', 'DECISION_BASIS_PROBE', 'CONSTRAINT_PROBE'].includes(d.move), `probe emitted under STOP_PROBE: ${d.move}`)
})

test('contradiction flag yields the gentle reconciliation move; conditioned accounts do not (§13)', () => {
  const s = warmedUp()
  let d = decide(s, ANSWER({ contradicts_buffer: 'ev-123' }), true)
  assert.equal(d.move, 'CONTRADICTION_MOVE')
  d = decide(s, ANSWER({ contradicts_buffer: 'ev-123', context_conditioned: true }), true)
  assert.notEqual(d.move, 'CONTRADICTION_MOVE')
})

test('closure sequence: member check → capture miss → pointers → safe close (§14.3)', () => {
  let s = warmedUp()
  s = { ...s, fatigue_score: 99 } // force INTERVENTION_COST stop
  const moves = []
  let d = { state: s }
  while (moves[moves.length - 1] !== 'SAFE_CLOSE') {
    d = decide(d.state, F(), false)
    moves.push(d.move)
    assert.ok(moves.length < 12, 'closure must terminate')
  }
  const tail = moves.slice(-4)
  assert.deepEqual(tail, ['MEMBER_CHECK', 'CAPTURE_MISS', 'CAPTURE_POINTERS', 'SAFE_CLOSE'])
  assert.equal(d.state.conversation, 'CLOSED')
})

test('DETERMINISM: identical flag script ⇒ byte-identical state and log, twice (§0.2)', () => {
  const script = [
    F(), F({ frame_acknowledged: true }), ANSWER(),
    ANSWER({ register: 'ESPOUSED', specificity: 'GENERAL' }),
    ANSWER({ sig_workaround: true }), ANSWER({ sig_vagueness: true }),
    ANSWER({ sig_relational: true }), F({ richness: 'THIN' }),
    ANSWER({ sig_it_depends: true }), ANSWER(), F({ sig_decline: true }),
    ANSWER({ sig_anomaly: true }), ANSWER(), F(), ANSWER({ sig_hedge: true }),
  ]
  const run = () => {
    let s = initRuntimeState(SEEDS)
    const trace = []
    for (const flags of script) {
      const d = decide(s, flags, flags.register !== 'NONE')
      trace.push(d.move + '|' + d.matched_guard)
      s = d.state
    }
    return JSON.stringify({ trace, s })
  }
  assert.equal(run(), run())
})
