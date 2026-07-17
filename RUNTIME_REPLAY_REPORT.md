# Runtime Replay Report

**Generated:** 2026-07-17 · pre-shadow validation gate (owner-mandated).
**Method:** every dataset replayed through the pure DECISION core **twice** (byte-determinism check on every script), fixture-flag tier (deterministic flag derivation — the true-PERCEIVE tier requires an API-key environment and is a promotion gate, not a pre-shadow gate).

## Datasets
| dataset | size | turns |
|---|---|---|
| Historical transcripts | 20 interviews | 70 |
| Adversarial corpus (permanent, in `npm test`) | 22 scenarios | 128 |

## Invariant compliance
| check | result |
|---|---|
| I1/I11 one move + one log entry per turn | 0 violations |
| I2 framing lockout | 0 violations |
| I3 repair-only under non-SAFE trust | 0 violations |
| I9 no over-probing | 0 violations |
| Determinism (double-run, byte-identical) | 0 failures |
| **Total violations** | **0** |

(I4–I7 — anchors, register, ceiling, person-eval — live in the extraction layer: 11 dedicated tests in `evidence.test.mjs`, all green. I12 single-barrelled rendering is a REALIZE property, checked at the live-shadow gate.)

## Move distribution
| move | count |
|---|---|
| OPEN_NEXT_TOPIC | 54 |
| ORIENT | 41 |
| ANCHOR | 33 |
| GAP_TEST | 17 |
| ACKNOWLEDGE_AND_ADVANCE | 9 |
| SAFE_CLOSE | 7 |
| REPAIR_MOVE | 5 |
| NEXT_TOPIC | 4 |
| CDM_DEEPEN | 4 |
| FRAME_STATEMENT | 4 |
| POINTER_CAPTURE | 3 |
| MEMBER_CHECK | 3 |
| CAPTURE_MISS | 3 |
| CAPTURE_POINTERS | 3 |
| REDIRECT_MOVE | 2 |
| LADDER_DOWN | 1 |
| CONTRADICTION_MOVE | 1 |
| DECISION_RULE_PROBE | 1 |
| DECISION_BASIS_PROBE | 1 |
| CONSTRAINT_PROBE | 1 |
| CLARIFY | 1 |

## Dispatcher guard distribution
| guard | count |
|---|---|
| 13-DEFAULT | 54 |
| 7-ORIENTING | 41 |
| 6-ANCHOR | 33 |
| 10-GAP_TEST | 17 |
| 12-STOP | 12 |
| 3-DECLINE | 9 |
| 9-PROBE | 5 |
| 1-SAFETY | 5 |
| closed | 4 |
| 11-ADVANCE | 4 |
| 8-STRONG_PROBE | 4 |
| 2-FRAME | 4 |
| 7-POINTER | 3 |
| 4-DO_NO_HARM | 2 |
| 5-CONTRADICTION | 1 |

## Conversation-transition coverage
| transition | count |
|---|---|
| FRAMING→ORIENTING | 41 |
| ORIENTING→EXPLORING | 41 |
| EXPLORING→DEEPENING | 16 |
| CLOSING→CLOSED | 3 |
| DEEPENING→REPAIRING | 2 |
| EXPLORING→CLOSING | 2 |
| REPAIRING→DEEPENING | 1 |
| EXPLORING→REPAIRING | 1 |
| REPAIRING→CLOSING | 1 |
| DEEPENING→EXPLORING | 1 |

**Exercised topic states:** UNOPENED, OPENED, SURFACE, ENACTED, SATURATED, PARKED_SENSITIVE, DEEP
**Not exercised in these datasets:** DEEPENING→GAP_TESTING, GAP_TESTING→EXPLORING, REPAIRING→EXPLORING, DEEPENING→CLOSING

## Behavior counters
| behavior | count |
|---|---|
| Probe moves total | 59 |
| Repair moves | 5 |
| Repair recoveries (GUARDED→SAFE) | 42 |
| Trust breaches (→BREACHED) | 1 |
| Contradiction moves | 1 |
| Pointer captures | 3 |
| Completed closures (SAFE_CLOSE) | 7 |
| Empty-perception turns survived (fallback behavior) | 25 |

## Fallback behavior
Perception-failure turns (empty flag sets) are exercised in both datasets and in the dedicated corpus scenario `perception-failure-empty-flags-stays-sane` — the engine emits exactly one sane move per turn and never crashes. End-to-end fallback (runtime failure → seamless offline-engine continuation, `mode:'simulated'` recorded) was browser-verified in the M2 fallback drill; the decline-everything scenario additionally proves the engine cannot trap a refusing participant (this scenario **caught and fixed a real liveness defect** before any participant could hit it).

## Verdict
**PASS** — zero invariant violations, zero determinism failures across both datasets. Ready for owner review and, on approval, `runtime_mode: shadow`.

