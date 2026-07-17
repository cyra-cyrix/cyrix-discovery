// The DECISION core — Runtime §5–§10, §13–§15, transcribed.
//
// PURE. No I/O, no model, no clock, no randomness. Given identical (flags,
// state) this module returns identical output, byte for byte (§0.2) — which is
// what makes I1–I12 unit-testable and replay deterministic. Judgment lives in
// PERCEIVE and REALIZE, on the other side of this boundary.
//
// Reading map: §5 trust → applyTrust · §6 topic → applyTopic · §7 lifecycle →
// applyLifecycle · §8 dispatcher → selectMove · §9.1 → probeSelect · §10 →
// probeWarranted/stopProbe · §13 → routeContradiction · §14 → stopPredicate +
// closing steps inside selectMove · §15 → priors constraints live in the topic
// seeds (state.ts) and hypothesis handling here.

import { RUNTIME_CONSTANTS as C } from './constants'
import {
  activeTopic, type FlagSet, type LogEntry,
  type Move, type RuntimeState, type TopicRecord, CDM_PASSES,
} from './state'

export interface Decision {
  move: Move
  matched_guard: string
  /** for REALIZE: which CDM pass, which topic to open, etc. */
  detail: string
  state: RuntimeState // the post-transition state (input is never mutated)
}

// ---------- §10 predicates ----------

export function probeWarranted(f: FlagSet): boolean {
  return (
    f.sig_generalization || f.sig_vagueness || f.sig_it_depends ||
    f.sig_workaround || f.sig_anomaly || f.sig_emotional ||
    f.sig_glossed_decision || f.sig_hedge
  )
}

export function stopProbe(s: RuntimeState, f: FlagSet): boolean {
  const t = activeTopic(s)
  return (
    (t !== null && t.empty_probes >= C.SATURATION_EMPTY_PROBES) ||
    f.sig_recall_exhausted ||
    s.trust !== 'SAFE' ||
    f.sig_sensitive ||
    f.sig_third_party_eval ||
    s.fatigue_score >= C.FATIGUE_LIMIT
  )
}

// ---------- §14.1 stopping predicates ----------

export function stopPredicate(s: RuntimeState): string | null {
  if (s.trust === 'BREACHED') return 'SAFETY_STOP'
  if (s.fatigue_score >= C.FATIGUE_LIMIT) return 'INTERVENTION_COST'
  const priorityTopics = s.topics.filter((t) => t.priority > 0)
  if (priorityTopics.length > 0 && priorityTopics.every((t) => t.state === 'DEEP' || t.state === 'SATURATED' || t.state === 'PARKED_SENSITIVE')) {
    return 'COVERAGE_MET'
  }
  if (s.saturation_streak >= C.GLOBAL_SATURATION_LIMIT) return 'SATURATION'
  return null
}

// ---------- §5 trust machine ----------

function applyTrust(s: RuntimeState, f: FlagSet): RuntimeState {
  const next = { ...s, recent_breaches: [...s.recent_breaches, f.trust_breach_marker].slice(-C.WINDOW) }
  const hard = f.trust_breach_marker === 'META_QUESTION' || f.trust_breach_marker === 'DISCOMFORT' || f.trust_breach_marker === 'DEFLECTION'
  const soft = f.trust_breach_marker === 'TERSE_SHIFT' || f.trust_breach_marker === 'ESPOUSED_RETREAT'

  if (next.trust === 'SAFE') {
    if (hard) return { ...next, trust: 'GUARDED', conversation: 'REPAIRING', cooperative_streak: 0, breach_streak: 1, fatigue_score: next.fatigue_score + C.FATIGUE_BREACH_INCREMENT }
    if (soft) {
      const soft_count = next.soft_breach_count + 1
      if (soft_count >= C.GUARD_REPEAT) {
        return { ...next, trust: 'GUARDED', conversation: 'REPAIRING', soft_breach_count: 0, cooperative_streak: 0, breach_streak: 1, fatigue_score: next.fatigue_score + C.FATIGUE_BREACH_INCREMENT }
      }
      return { ...next, soft_breach_count: soft_count }
    }
    return { ...next, soft_breach_count: 0 }
  }

  if (next.trust === 'GUARDED') {
    if (f.trust_breach_marker === 'NONE' && !f.sig_decline) {
      const streak = next.cooperative_streak + 1
      if (next.conversation === 'FRAMING') {
        // §5.1 row 1 — GUARDED→SAFE on acknowledged frame + cooperation
        if (f.frame_acknowledged) return { ...next, cooperative_streak: streak }
        return { ...next, cooperative_streak: streak }
      }
      if (streak >= C.GUARD_CLEAR) {
        // repair succeeded — resume (lifecycle handled in applyLifecycle)
        return { ...next, trust: 'SAFE', cooperative_streak: 0, breach_streak: 0, conversation: next.conversation === 'REPAIRING' ? 'EXPLORING' : next.conversation }
      }
      return { ...next, cooperative_streak: streak }
    }
    const breach_streak = next.breach_streak + 1
    if (next.conversation === 'REPAIRING' && breach_streak >= C.BREACH_LIMIT) {
      return { ...next, trust: 'BREACHED', breach_streak, conversation: 'CLOSING' }
    }
    return { ...next, breach_streak, cooperative_streak: 0 }
  }

  return next // BREACHED is terminal-bound (forces CLOSING via stopPredicate)
}

// ---------- §6 topic machine (driven by flags on the ACTIVE topic) ----------

function applyTopic(s: RuntimeState, f: FlagSet): RuntimeState {
  const t = activeTopic(s)
  if (!t || s.conversation === 'FRAMING' || s.conversation === 'ORIENTING') return s

  const patch = (p: Partial<TopicRecord>): RuntimeState => ({
    ...s,
    topics: s.topics.map((x) => (x.id === t.id ? { ...x, ...p } : x)),
  })

  if (f.sig_sensitive) return patch({ state: 'PARKED_SENSITIVE' })

  const espoused_seen = t.espoused_seen || f.register === 'ESPOUSED' || f.register === 'MIXED'
  const enacted_seen = t.enacted_seen || f.register === 'ENACTED' || f.register === 'MIXED'

  if (t.state === 'OPENED') {
    if (f.register === 'ENACTED' && (f.specificity === 'RECENT_INSTANCE' || f.specificity === 'DATED_INCIDENT')) {
      return patch({ state: 'ENACTED', espoused_seen, enacted_seen })
    }
    if (f.register === 'ESPOUSED' || f.specificity === 'GENERAL') {
      return patch({ state: 'SURFACE', espoused_seen, enacted_seen })
    }
    return patch({ espoused_seen, enacted_seen })
  }
  if (t.state === 'SURFACE') {
    // anchor obtained ⇒ ENACTED (§6 last row)
    if (f.register === 'ENACTED' && (f.specificity === 'RECENT_INSTANCE' || f.specificity === 'DATED_INCIDENT')) {
      return patch({ state: 'ENACTED', espoused_seen, enacted_seen })
    }
    return patch({ espoused_seen, enacted_seen })
  }
  if (t.state === 'ENACTED' && t.cdm_done.length >= CDM_PASSES.length) {
    return patch({ state: 'DEEP', espoused_seen, enacted_seen })
  }
  return patch({ espoused_seen, enacted_seen })
}

// ---------- evidence-yield bookkeeping (empty_probes, saturation) ----------

function applyYield(s: RuntimeState, yieldedEvidence: boolean): RuntimeState {
  const t = activeTopic(s)
  if (!t) return s
  const wasProbe = s.last_move !== null && ['ANCHOR', 'CDM_DEEPEN', 'DECISION_RULE_PROBE', 'DECISION_BASIS_PROBE', 'MECHANICS_PROBE', 'CONSTRAINT_PROBE', 'CLARIFY', 'LADDER_DOWN', 'GAP_TEST'].includes(s.last_move)
  if (!wasProbe) return s
  const empty_probes = yieldedEvidence ? 0 : t.empty_probes + 1
  let next: RuntimeState = { ...s, topics: s.topics.map((x) => (x.id === t.id ? { ...x, empty_probes } : x)) }
  if (empty_probes >= C.SATURATION_EMPTY_PROBES && t.state !== 'DEEP') {
    next = {
      ...next,
      topics: next.topics.map((x) => (x.id === t.id ? { ...x, state: 'SATURATED' } : x)),
      saturation_streak: yieldedEvidence ? 0 : next.saturation_streak + 1,
    }
  } else if (yieldedEvidence) {
    next = { ...next, saturation_streak: 0 }
  }
  return next
}

// ---------- §7 lifecycle ----------

function applyLifecycle(s: RuntimeState, f: FlagSet): RuntimeState {
  if (s.conversation === 'FRAMING' && f.frame_acknowledged) {
    // §3/§5.1: leaving FRAMING requires acknowledgment; trust clears with it
    return { ...s, conversation: 'ORIENTING', trust: 'SAFE' }
  }
  if (s.conversation === 'ORIENTING') {
    // role + real-work located ⇒ EXPLORING. Perception signal: any substantive
    // register on an utterance while orienting.
    if (f.register !== 'NONE') return { ...s, conversation: 'EXPLORING' }
    return s
  }
  const t = activeTopic(s)
  if (s.conversation === 'EXPLORING' && t && (t.state === 'ENACTED' || f.sig_workaround || f.sig_anomaly)) {
    return { ...s, conversation: 'DEEPENING' }
  }
  if (s.conversation === 'DEEPENING' && t && (t.state === 'DEEP' || t.state === 'SATURATED')) {
    const gapIncomplete = (t.espoused_seen !== t.enacted_seen) && !t.gap_tested
    return { ...s, conversation: gapIncomplete ? 'GAP_TESTING' : 'EXPLORING' }
  }
  if (s.conversation === 'GAP_TESTING' && t && t.gap_tested) {
    return { ...s, conversation: 'EXPLORING' }
  }
  return s
}

// ---------- §8.2 next-topic selection (deterministic) ----------

function nextTopicId(s: RuntimeState): string | null {
  const candidates = s.topics.filter((t) => t.state === 'UNOPENED' || t.state === 'SURFACE')
  if (candidates.length === 0) return null
  candidates.sort((a, b) => b.priority - a.priority || (a.id < b.id ? -1 : 1))
  return candidates[0].id
}

// ---------- §9.1 probe selection ----------

function probeSelect(f: FlagSet): { move: Move; detail: string } {
  if (f.sig_it_depends) return { move: 'DECISION_RULE_PROBE', detail: 'depends-on-what' }
  if (f.sig_glossed_decision) return { move: 'DECISION_BASIS_PROBE', detail: 'cues-options' }
  if (f.sig_vagueness) return { move: 'MECHANICS_PROBE', detail: 'ladder-down-mechanics' }
  if (f.sig_emotional) return { move: 'CONSTRAINT_PROBE', detail: 'source-of-emotion' }
  if (f.sig_hedge) return { move: 'CLARIFY', detail: 'hedge' }
  return { move: 'LADDER_DOWN', detail: 'default-ladder' }
}

// ---------- §8 the dispatcher — first match wins, exactly one move ----------

export function decide(prev: RuntimeState, f: FlagSet, yieldedEvidence: boolean): Decision {
  // State transitions first (§2 order): trust → topic → yield → lifecycle
  let s = applyTrust(prev, f)
  s = applyTopic(s, f)
  s = applyYield(s, yieldedEvidence)
  s = applyLifecycle(s, f)
  s = { ...s, turn_index: s.turn_index + 1 }
  if (f.richness === 'THIN' && f.register === 'NONE' && s.conversation !== 'FRAMING') {
    s = { ...s, fatigue_score: s.fatigue_score + C.FATIGUE_THIN_INCREMENT }
  }

  const finish = (move: Move, guard: string, detail: string, s2: RuntimeState): Decision => {
    const entry: LogEntry = {
      turn: s2.turn_index, matched_guard: guard, move,
      conversation: s2.conversation, trust: s2.trust,
      active_topic: s2.active_topic_id, note: detail,
    }
    return { move, matched_guard: guard, detail, state: { ...s2, last_move: move, decision_log: [...s2.decision_log, entry] } }
  }

  // CLOSING sequence (§14.3) runs as its own ladder once entered.
  if (s.conversation === 'CLOSING') {
    if (s.closing_step === 0) return finish('MEMBER_CHECK', '12-STOP/member-check', `reflect top ${C.MEMBER_CHECK_K}`, { ...s, closing_step: 1 })
    if (s.closing_step === 1) return finish('CAPTURE_MISS', '12-STOP/capture-miss', 'what should I have asked', { ...s, closing_step: 2 })
    if (s.closing_step === 2) return finish('CAPTURE_POINTERS', '12-STOP/capture-pointers', 'who else holds this', { ...s, closing_step: 3 })
    return finish('SAFE_CLOSE', '12-STOP/safe-close', 'thanks; protection; retraction right', { ...s, closing_step: 4, conversation: 'CLOSED' })
  }
  if (s.conversation === 'CLOSED') {
    return finish('SAFE_CLOSE', 'closed', 'already closed', s)
  }

  // 1. SAFETY
  if (s.trust !== 'SAFE') {
    if (s.conversation === 'FRAMING') return finish('FRAME_STATEMENT', '2-FRAME', 'frame not yet acknowledged', s)
    return finish('REPAIR_MOVE', '1-SAFETY', s.repair_offer_made ? 'repair-continue' : 'repair-restate-firewall', { ...s, conversation: 'REPAIRING', repair_offer_made: true })
  }
  // 2. FRAME
  if (s.conversation === 'FRAMING') {
    return finish('FRAME_STATEMENT', '2-FRAME', 'state frame; await acknowledgment', s)
  }
  // 3. DECLINE — honor, no trust change (§5.1 last row). "Advance" must
  // actually advance: saturate the declined topic, open the next, and when
  // nothing remains, close gracefully — a participant who declines everything
  // must never be trapped in an acknowledgment loop (corpus:
  // decline-everything-never-traps caught exactly that defect).
  if (f.sig_decline) {
    const t = activeTopic(s)
    let s2 = t
      ? { ...s, topics: s.topics.map((x) => (x.id === t.id ? { ...x, state: 'SATURATED' as const } : x)), active_topic_id: null }
      : s
    const nid = nextTopicId(s2)
    if (nid) {
      s2 = { ...s2, active_topic_id: nid, topics: s2.topics.map((x) => (x.id === nid && x.state === 'UNOPENED' ? { ...x, state: 'OPENED' as const } : x)) }
      return finish('ACKNOWLEDGE_AND_ADVANCE', '3-DECLINE', `decline honored; open:${nid}`, s2)
    }
    return finish('ACKNOWLEDGE_AND_ADVANCE', '3-DECLINE', 'decline honored; nothing left — closing', { ...s2, conversation: 'CLOSING', closing_step: 0 })
  }
  // 4. DO_NO_HARM
  if (f.sig_sensitive || f.sig_third_party_eval) {
    return finish('REDIRECT_MOVE', '4-DO_NO_HARM', f.sig_sensitive ? 'sensitive→process-question' : 'person-eval→process-question', s)
  }
  // 5. CONTRADICTION (§13 — the move; routing of items happens in EXTRACT)
  if (f.contradicts_buffer !== null && !f.context_conditioned) {
    return finish('CONTRADICTION_MOVE', '5-CONTRADICTION', `reconcile-gently:${f.contradicts_buffer}`, { ...s, contradiction_count: s.contradiction_count + 1 })
  }
  // ORIENTING has no topic machinery yet — one orienting move until lifecycle advances.
  if (s.conversation === 'ORIENTING') {
    return finish('ORIENT', '7-ORIENTING', 'locate role, real work, network', s)
  }
  const t = activeTopic(s)
  // 6. ANCHOR — anchor-before-deepen (binding, §6)
  if (t && t.state === 'SURFACE') {
    return finish('ANCHOR', '6-ANCHOR', `anchor:${t.id}`, s)
  }
  // 7. POINTER
  if (f.sig_inarticulable || f.sig_relational) {
    return finish('POINTER_CAPTURE', '7-POINTER', 'capture holder/conditions', { ...s, pointer_count: s.pointer_count + 1 })
  }
  // 8. STRONG_PROBE
  if ((f.sig_workaround || f.sig_anomaly) && t && t.state !== 'SATURATED') {
    const pass = t.cdm_done.length < CDM_PASSES.length ? CDM_PASSES[t.cdm_done.length] : 'counterfactual'
    const s2 = { ...s, topics: s.topics.map((x) => (x.id === t.id ? { ...x, cdm_done: x.cdm_done.length < CDM_PASSES.length ? [...x.cdm_done, pass] : x.cdm_done } : x)) }
    return finish('CDM_DEEPEN', '8-STRONG_PROBE', `cdm:${pass}`, s2)
  }
  // 9. PROBE
  if (probeWarranted(f) && !stopProbe(s, f)) {
    const p = probeSelect(f)
    return finish(p.move, `9-PROBE/${p.move}`, p.detail, s)
  }
  // 10. GAP_TEST
  if (t && (t.state === 'ENACTED' || t.state === 'DEEP') && (t.espoused_seen !== t.enacted_seen) && !t.gap_tested) {
    const s2 = { ...s, topics: s.topics.map((x) => (x.id === t.id ? { ...x, gap_tested: true } : x)), open_gap_count: s.open_gap_count + 1 }
    return finish('GAP_TEST', '10-GAP_TEST', t.espoused_seen ? 'have-espoused-need-enacted' : 'have-enacted-need-espoused', s2)
  }
  // 11. ADVANCE
  if (t && (t.state === 'DEEP' || t.state === 'SATURATED' || t.state === 'PARKED_SENSITIVE')) {
    const nid = nextTopicId(s)
    if (nid) {
      const s2 = { ...s, active_topic_id: nid, topics: s.topics.map((x) => (x.id === nid && x.state === 'UNOPENED' ? { ...x, state: 'OPENED' as const } : x)) }
      return finish('NEXT_TOPIC', '11-ADVANCE', `open:${nid}`, s2)
    }
    // nothing left to open — fall through to STOP
  }
  // 12. STOP
  const stop = stopPredicate(s)
  if (stop) {
    return finish('MEMBER_CHECK', `12-STOP/${stop}`, `enter closing: ${stop}`, { ...s, conversation: 'CLOSING', closing_step: 1 })
  }
  // 13. DEFAULT — open next topic
  const nid = nextTopicId(s)
  if (nid) {
    const s2 = { ...s, active_topic_id: nid, topics: s.topics.map((x) => (x.id === nid && x.state === 'UNOPENED' ? { ...x, state: 'OPENED' as const } : x)) }
    return finish('OPEN_NEXT_TOPIC', '13-DEFAULT', `open:${nid}`, s2)
  }
  // No topics at all left — close.
  return finish('MEMBER_CHECK', '12-STOP/EXHAUSTED', 'no topics remain', { ...s, conversation: 'CLOSING', closing_step: 1 })
}
