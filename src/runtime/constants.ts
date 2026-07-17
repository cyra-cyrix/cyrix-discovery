// Runtime §17 — named constants. Every threshold the DECISION core consults
// lives here, never inline (§0.2). All values are PARKED for empirical
// calibration: these are the spec's start points, not decisions. Change them
// here and only here; the engine architecture must not notice.

export const RUNTIME_CONSTANTS = {
  SATURATION_EMPTY_PROBES: 2, // empty probes before a topic → SATURATED
  GLOBAL_SATURATION_LIMIT: 3, // saturated topics in a row → STOP
  GUARD_REPEAT: 2, // soft breach markers before SAFE→GUARDED
  GUARD_CLEAR: 2, // cooperative turns to clear GUARDED→SAFE
  BREACH_LIMIT: 3, // persisting breach turns → BREACHED→CLOSING
  FATIGUE_LIMIT: 8, // PARKED — provisional: fatigue_score threshold → intervention-cost stop
  WINDOW: 5, // recent_signals ring buffer size
  MEMBER_CHECK_K: 3, // PARKED — provisional: findings reflected at closure
  /** Fatigue increments (PARKED — the spec leaves the scoring rule open;
   *  provisional rule: +1 per THIN low-content turn, +2 on breach markers). */
  FATIGUE_THIN_INCREMENT: 1,
  FATIGUE_BREACH_INCREMENT: 2,
} as const

export type RuntimeConstants = typeof RUNTIME_CONSTANTS
