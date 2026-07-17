# Runtime Migration Plan — Milestone 2

**Date:** 2026-07-17 · Status: **awaiting approval — no implementation begun.**
Governs how `CYRA_INTERVIEW_ENGINE_RUNTIME.md` becomes the live interviewer without ever betting a participant's twenty minutes on unproven code. Binds to the M0 decisions (feature flag, parallel running, legacy as fallback, transcript-validated rollout).

---

## 1 · Migration architecture

**The runtime becomes the third engine behind the existing engine contract.** Nothing about the participant surface, checkpoint durability, or the offline failsafe changes.

- **`src/runtime/`** — new module. `state.ts` (the §1 blackboard, typed), `decision.ts` (§5–§10, §13–§15 as pure functions — no I/O, no model, no clock), `constants.ts` (§17 named constants as config with spec defaults, PARKED status preserved in comments), `perceive.ts` + `realize.ts` (prompt + schema contracts for the only two model-assisted steps).
- **Turn flow:** client sends the answer exactly as today → `POST /api/ai` with an engine discriminator → server runs PERCEIVE (small bounded call emitting the §4 FlagSet) → EXTRACT reuses **Milestone 1's deterministic pipeline** (`realizeCandidate`, §11/§12) so evidence items are born live with true per-turn `elicitation` → APPLY_STATE_TRANSITIONS + SELECT_MOVE (pure `decision.ts`) → REALIZE renders the single chosen move → response returns reply + state delta + the I11 log entry.
- **State persistence rides the proven rails:** the blackboard + decision log are checkpointed as an additive `runtime` field on `Interview` — same revisioned, outbox-buffered durability that survived production. Legacy records don't have the field; legacy engines ignore it. Refresh/resume restores mid-interview runtime state for free.
- **Handoff (§14.4):** on CLOSED, the envelope (items RAW..FLAGGED, gaps, contradictions, pointers, coverage notes) is written to the M1 evidence store with `extractor: 'runtime'` — the M1 post-hoc extractor simply doesn't run for runtime interviews.
- **Engine identity:** `Interview.mode` gains `'runtime'` (additive union). An interview never switches engines mid-flight except downward, to the offline fallback (§4 below).
- **§15 priors gating** replaces `priorFindingsFor` injection *for runtime interviews only*; legacy interviews keep current behavior until retirement (§6).

## 2 · Feature flag strategy

One server-held flag, readable per turn, changeable **without a deploy**:

- `runtime_mode` lives in a config blob (admin-mutable via a gated API route), env-var fallback: **`off` → `shadow` → `pilot` → `default`**.
  - `off` — runtime code deployed but dormant.
  - `shadow` — legacy engines serve participants; runtime evaluates silently beside them (§3).
  - `pilot` — runtime serves **only** interviews explicitly marked for it (internal test-runs and admin-created pilot invites). Participants at large still get the legacy engine.
  - `default` — new interviews start on the runtime engine; in-flight interviews keep the engine they started with.
- Per-invite override (`engine: 'runtime'` on the invite) enables pilot interviews regardless of global stage. Nothing ever force-upgrades an in-flight interview.

## 3 · Shadow mode (two tiers, cheap first)

1. **Replay harness (offline, primary).** A script feeds every stored transcript — production and local — through PERCEIVE + DECISION turn by turn (REALIZE skipped; invariants don't need prose). Asserts **I1–I12 on every turn**, dumps decision logs + evidence deltas for review, and re-runs DECISION twice per turn to prove byte-identical determinism. This is where almost all defects die, at zero participant risk and near-zero cost.
2. **Live shadow (secondary).** With `runtime_mode: shadow`, after each legacy-engine turn the server fire-and-forgets a shadow evaluation (PERCEIVE + DECISION only) on the same utterance. Output is stored to the decision log, never shown. Zero participant impact; one small model call per turn of overhead. Yields: real-world flag distributions, would-have-done move traces, PERCEIVE latency percentiles (the 502 lesson — measured *before* anyone waits on it).

Shadow metrics reviewed before any stage promotion: invariant violations (must be zero), leading_count, move distribution sanity, PERCEIVE p95, evidence yield vs. the M1 retrofit extractor on the same transcripts.

## 4 · Rollback strategy (three tiers, fastest first)

1. **Flag flip** — `runtime_mode` back a stage via the config blob: instant, no deploy, affects new turns immediately.
2. **In-flight degradation** — a runtime turn that fails (PERCEIVE error, invariant trip at runtime, budget breach) falls back to the **offline engine mid-conversation**, exactly the proven BL-3 pattern: the participant sees a seamless next question, never an error; the answer is already checkpointed; the decision log records the trip. An invariant violation in production is treated as a defect that *also* auto-degrades that interview.
3. **Git revert + redeploy** — the standing pipeline, already exercised.

Data safety: the `runtime` field is additive; evidence envelopes are derived and regenerable; there is no migration to unwind at any tier.

## 5 · Runtime acceptance criteria (gates to `default`)

1. **Replay corpus clean:** I1–I12 hold on every turn of every stored transcript; zero violations; DECISION byte-deterministic across repeated runs.
2. **Latency proven:** PERCEIVE + REALIZE p95 comfortably inside the synchronous function budget, measured in live shadow — before any participant waits on it.
3. **Live shadow clean** on at least **5** production interviews (count adjustable by you): zero invariant violations, sane move traces on review.
4. **One full internal test-run interview** end-to-end on the runtime engine: FRAMING → acknowledgment → ORIENTING → topic lifecycle with anchor-before-deepen → member check → capture-miss → pointer capture → SAFE_CLOSE → §14.4 envelope lands in the evidence store.
5. **One authenticated production pilot interview** completed on the runtime engine, `mode: 'runtime'` on the stored record (administrator-run — same credential boundary as M1's outstanding check).
6. **Fallback drill passed:** forced PERCEIVE failure mid-interview degrades to the offline engine with no participant-visible error (browser-verified, as BL-3 was).
7. **Safety paths exercised synthetically:** trust breach → REPAIRING → repair/graceful close; `sig_decline` honored; `sig_sensitive`/third-party-eval redirected and never extracted (scripted utterances through the full engine).
8. **Your qualitative sign-off** on pilot transcripts: the conversation reads as the Methodology intends. This gate is yours, not mine.

## 6 · Legacy engine retirement criteria

- **The offline (simulated) engine never retires.** It is the no-dead-end guarantee and the fallback tier for the runtime engine itself.
- **The legacy live engine** (single-prompt `runTurn` + interviewer prompt + `priorFindingsFor` injection) retires when **all** hold:
  1. All §5 acceptance criteria met and `runtime_mode: default` in production.
  2. ≥ **20** production interviews completed on the runtime engine (≈ pilot scale; adjustable) with zero engine-attributable P0/P1 defects.
  3. No in-flight interviews remain on `mode: 'live'`.
  4. Your written sign-off.
- Retirement is its own commit with the full regression gate: remove the legacy turn path and the §15-violating priors injection; the report/analysis prompt is untouched (it belongs to M3+'s diagnosis modules, not this migration).

---

*Approval of this plan starts Milestone 2. Until then, no runtime code is written.*
