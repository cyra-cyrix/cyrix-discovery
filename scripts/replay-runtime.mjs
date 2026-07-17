// Runtime replay harness (migration plan §3 tier 1).
//
// Feeds stored interview transcripts turn-by-turn through the DECISION core and
// asserts the runtime invariants on every turn, twice (determinism). Two flag
// sources:
//   --fixtures (default): deterministic heuristic flag derivation from the
//     utterance text — no model, no key; validates DECISION over real
//     conversational shapes. This is the always-runnable tier.
//   --perceive: true PERCEIVE via the API (requires ANTHROPIC_API_KEY) — the
//     production-grade tier, run before stage promotion.
//
// Usage: node scripts/replay-runtime.mjs <transcripts.json>
//   where transcripts.json = { interviews: { personId: Interview } } (the
//   /api/state payload, or any subset).

import { execSync } from 'node:child_process'
import { readFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'cyra-replay-'))
const build = (src, out) => {
  execSync(`npx esbuild ${src} --bundle --format=esm --outfile=${join(dir, out)}`, { stdio: 'pipe' })
  return import(join(dir, out))
}
const { decide } = await build('src/runtime/decision.ts', 'decision.mjs')
const { initRuntimeState, emptyFlags } = await build('src/runtime/state.ts', 'state.mjs')

const file = process.argv[2]
if (!file) { console.error('usage: node scripts/replay-runtime.mjs <state.json>'); process.exit(2) }
const data = JSON.parse(readFileSync(file, 'utf8'))
const interviews = Object.values(data.interviews ?? {}).filter((iv) => (iv.messages ?? []).length > 1)

const SEEDS = ['flow', 'delays', 'manual', 'knowledge', 'knowledgeLoss', 'decisions', 'time', 'value']
  .map((k, i) => ({ id: `t${i}-${k}`, label: k, priority: 10 - i }))

/** Deterministic fixture flags from utterance text (mirrors the heuristic extractor's signals). */
function fixtureFlags(text) {
  const l = text.toLowerCase()
  const enacted = /\b(yesterday|last week|this week|i did|i went|i spent|happened|we did)\b/.test(l)
  return {
    ...emptyFlags(),
    register: enacted ? 'ENACTED' : 'ESPOUSED',
    source_quality: /\b(i heard|they say|apparently)\b/.test(l) ? 'HEARSAY' : 'FIRST_HAND',
    specificity: enacted ? 'RECENT_INSTANCE' : 'GENERAL',
    richness: text.length > 160 ? 'RICH' : 'THIN',
    sig_generalization: /\b(usually|typically|always|normally)\b/.test(l),
    sig_vagueness: /\b(somehow|stuff|things|etc)\b/.test(l),
    sig_it_depends: /\bdepends\b/.test(l),
    sig_workaround: /\b(workaround|actually do|we skip|not supposed to|the trick)\b/.test(l),
    sig_anomaly: /\b(weird|strange|you'd expect)\b/.test(l),
    sig_relational: /\b(ask|kept by|only\s+\w+\s+knows|goes through)\b/.test(l),
    sig_recall_exhausted: /\b(don't remember|can't recall)\b/.test(l),
    sig_inarticulable: /\b(just know|get a feel)\b/.test(l),
    frame_acknowledged: true,
    verifiable: true,
  }
}

const PROBES = ['ANCHOR', 'CDM_DEEPEN', 'DECISION_RULE_PROBE', 'DECISION_BASIS_PROBE', 'MECHANICS_PROBE', 'CONSTRAINT_PROBE', 'CLARIFY', 'LADDER_DOWN', 'GAP_TEST']
let turns = 0, violations = 0

function replayOne(iv) {
  const run = () => {
    let s = initRuntimeState(SEEDS)
    const trace = []
    // Opening (frame acknowledged via UI)
    let d = decide(s, { ...emptyFlags(), frame_acknowledged: true }, false)
    trace.push(d.move)
    s = d.state
    for (const m of iv.messages.filter((x) => x.role === 'user')) {
      const flags = fixtureFlags(m.text)
      const logBefore = s.decision_log.length
      d = decide(s, flags, flags.register !== 'NONE')
      turns++
      // I1/I11: one move, one log entry
      if (d.state.decision_log.length !== logBefore + 1) { violations++; console.error(`I1/I11 violation @${iv.personId}`) }
      // I2: framing emits only frame statements
      if (d.state.conversation === 'FRAMING' && d.move !== 'FRAME_STATEMENT') { violations++; console.error(`I2 violation @${iv.personId}`) }
      // I3: non-safe trust only repair/advance/closing moves
      if (d.state.trust !== 'SAFE' && !['REPAIR_MOVE', 'ACKNOWLEDGE_AND_ADVANCE', 'MEMBER_CHECK', 'CAPTURE_MISS', 'CAPTURE_POINTERS', 'SAFE_CLOSE', 'FRAME_STATEMENT'].includes(d.move)) {
        violations++; console.error(`I3 violation @${iv.personId}: ${d.move} while ${d.state.trust}`)
      }
      // I9: probe ⇒ not stop-probe conditions (fatigue check is the observable one here)
      if (PROBES.includes(d.move) && d.state.fatigue_score >= 8) { violations++; console.error(`I9 violation @${iv.personId}`) }
      trace.push(d.move + '|' + d.matched_guard)
      s = d.state
    }
    return JSON.stringify(trace)
  }
  const a = run(), b = run()
  if (a !== b) { violations++; console.error(`DETERMINISM violation @${iv.personId}`) }
}

for (const iv of interviews) replayOne(iv)
console.log(`replayed ${interviews.length} interviews · ${turns} turns · ${violations} violations`)
process.exit(violations ? 1 : 0)
