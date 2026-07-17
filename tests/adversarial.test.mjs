// Adversarial corpus runner — permanent regression gate (runs in `npm test`).
// Every scenario: replay through the pure DECISION core, assert the runtime
// invariants on every turn, determinism (double run), and the scenario's own
// expectations.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SCENARIOS } from './corpus/adversarial.mjs'

const dir = mkdtempSync(join(tmpdir(), 'cyra-adv-'))
const build = async (src, out) => {
  execSync(`npx esbuild ${src} --bundle --format=esm --outfile=${join(dir, out)}`, { stdio: 'pipe' })
  return import(join(dir, out))
}
const { decide } = await build('src/runtime/decision.ts', 'decision.mjs')
const { initRuntimeState, emptyFlags } = await build('src/runtime/state.ts', 'state.mjs')

const SEEDS = ['flow', 'delays', 'manual', 'knowledge', 'knowledgeLoss', 'decisions', 'time', 'value']
  .map((k, i) => ({ id: `t${i}-${k}`, label: k, priority: 10 - i }))
const PROBES = ['ANCHOR', 'CDM_DEEPEN', 'DECISION_RULE_PROBE', 'DECISION_BASIS_PROBE', 'MECHANICS_PROBE', 'CONSTRAINT_PROBE', 'CLARIFY', 'LADDER_DOWN', 'GAP_TEST']
const SAFE_MOVES_UNDER_BREACH = ['REPAIR_MOVE', 'ACKNOWLEDGE_AND_ADVANCE', 'MEMBER_CHECK', 'CAPTURE_MISS', 'CAPTURE_POINTERS', 'SAFE_CLOSE', 'FRAME_STATEMENT']

export function runScenario(sc) {
  const play = () => {
    let s = initRuntimeState(SEEDS)
    const moves = []
    const states = []
    sc.turns.forEach((partial, i) => {
      const flags = { ...emptyFlags(), ...partial }
      const yielded = sc.yields ? Boolean(sc.yields[i]) : flags.register !== 'NONE'
      const logBefore = s.decision_log.length
      const d = decide(s, flags, yielded)
      // I1/I11 on every turn of every scenario
      assert.equal(d.state.decision_log.length, logBefore + 1, `${sc.name}: log entry per turn`)
      // I2
      if (d.state.conversation === 'FRAMING') assert.equal(d.move, 'FRAME_STATEMENT', `${sc.name}: I2`)
      // I3
      if (d.state.trust !== 'SAFE') assert.ok(SAFE_MOVES_UNDER_BREACH.includes(d.move), `${sc.name}: I3 (${d.move} while ${d.state.trust})`)
      moves.push(d.move)
      states.push(d.state)
      s = d.state
    })
    return { moves, states, final: s }
  }
  const a = play()
  const b = play()
  assert.equal(JSON.stringify(a.moves), JSON.stringify(b.moves), `${sc.name}: determinism`)
  return a
}

for (const sc of SCENARIOS) {
  test(`corpus: ${sc.name}`, () => {
    const { moves, states, final } = runScenario(sc)
    const e = sc.expect ?? {}
    if (e.endState) assert.equal(final.conversation, e.endState, `endState (got ${final.conversation}; moves: ${moves.join(',')})`)
    if (e.endTrust) assert.equal(final.trust, e.endTrust, `endTrust (got ${final.trust})`)
    if (e.mustInclude) {
      let idx = 0
      for (const m of e.mustInclude) {
        idx = moves.indexOf(m, idx)
        assert.notEqual(idx, -1, `missing ${m} (moves: ${moves.join(',')})`)
        idx++
      }
    }
    for (const m of e.mustNotInclude ?? []) assert.ok(!moves.includes(m), `forbidden move ${m} appeared (moves: ${moves.join(',')})`)
    if (e.afterTurn) {
      const tail = moves.slice(e.afterTurn.turn)
      for (const m of e.afterTurn.forbidden) assert.ok(!tail.includes(m), `${m} after turn ${e.afterTurn.turn}`)
    }
    if (e.maxConsecutiveProbes) {
      let run = 0, worst = 0
      for (const m of moves) { run = PROBES.includes(m) ? run + 1 : 0; worst = Math.max(worst, run) }
      assert.ok(worst <= e.maxConsecutiveProbes, `consecutive probes ${worst} > ${e.maxConsecutiveProbes}`)
    }
    if (sc.check) {
      const err = sc.check(states)
      assert.equal(err, null, err ?? '')
    }
  })
}
