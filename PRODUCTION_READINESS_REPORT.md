# Production Readiness Report — CYRA Discovery

**Date:** 2026-07-17 · **Scope:** first 100 internal users · **Verdict: NOT READY — 3 release blockers (P0), 7 major issues (P1).**

**Method.** Every finding below is either **[reproduced]** (I executed it against the real local stack — `npx netlify dev`, real functions, real Blobs, real browser) or **[code-proven]** (traced through source with file:line; not executed). Nothing is speculation; where I could not test, the Coverage table says so. Companion document: `STABILIZATION_BACKLOG.md` (fix plans, efforts, regression tests).

**Release standard applied:** a participant completes a 20–30 minute interview through refreshes, closed browsers, network loss and AI failure without losing one answer; the Innovation Team never sees corrupted or inconsistent data.

---

## 1 · Workflow coverage

| Workflow | Result | Evidence |
|---|---|---|
| **INVITATION** | | |
| Create invitation | PASS | People page → invite created, single active invite per person enforced (`generate` disables the prior one) |
| Copy invitation | PASS (P3 gap) | Copies full URL; failure is silent and the visible fragment ≠ copied URL (BL-27) |
| Open invitation | PASS | Fresh + cross-device (server-resolved) |
| Invalid invitation | PASS | Bad checksum → "isn't valid" notice; well-formed unknown → same |
| Expired invitation | N/A | No expiry concept exists; "disable" is the mechanism (BL-31, product gap noted) |
| Completed invitation | PASS | Resolves `completed`, shows correct notice, interview withheld |
| Duplicate invitation | PASS | Regenerate disables the old link first (failure feedback gap: BL-20) |
| **INTERVIEW** | | |
| Welcome screen | **FAIL — P0** | With a resumable interview, the *primary* button destroys the transcript (BL-2, reproduced) |
| Context screen | PASS | Validation, optional fields, prefill from roster |
| AI conversation (offline engine) | PASS | Turn loop, fact extraction, coverage growth |
| AI conversation (live engine) | **FAIL — P0 (production)** | ~30s 502 after several turns; root-cause chain traced (BL-1); live path untestable locally (no key) |
| Voice mode | PARTIAL — not runtime-verified | Mode switch UI works; mic/TTS runtime not exercisable in this environment. Code review found silent permission-denial failure (BL-9) |
| Text mode | PASS | Enter-to-send, Shift+Enter newline, double-send guarded |
| Switch modes | PASS (code) | TTS cancelled on switch; recognition stopped |
| Wrap up | PASS | Gated on ≥3 answers; summary accurate |
| Submission | PASS (P2 gap) | E2E: submit → generating → complete → report + founder brief + opportunity + invite marked used. No double-submit guard (BL-21) |
| **RELIABILITY** | | |
| Refresh browser | PASS | Full transcript restored, resume offered |
| Close browser / Browser restart | PASS | Same path as refresh (server-held state) |
| Resume interview | PASS | "Continue where I left off" restores exactly (but see BL-2) |
| Network disconnect | PASS | Outbox buffered the turn, retried unprompted on reconnect, drained on ack (re-verified this audit) |
| AI failure (turn) | **FAIL — P0** | Only the *opening* falls back to the offline engine; a mid-conversation live failure shows a raw error ("Unexpected end of JSON input") and the conversation cannot advance (BL-3) |
| Server restart | PASS | Pre-restart interview intact after `netlify dev` restart (Blobs persist) |
| Multiple tabs | **FAIL — P1** | Second tab's answer silently discarded server-side AND dropped from its outbox; UI claims it was saved (BL-4, reproduced). Completed-elsewhere interview: stale tab accepts "ghost" answers with zero feedback (BL-22) — but server immutability held (no corruption) |
| Session timeout | PASS | No sessions to expire; token-in-URL is the credential |
| Long interview / large transcript | PASS locally / RISK in production | Checkpoints fine; but each live turn re-sends the transcript **twice** plus the whole interviews map (BL-1a); admin internal runs approach the 6 MB request cap |
| **DASHBOARD** | | |
| Report generation | PASS | Simulated analysis path E2E; live path untested (no key) |
| Founder brief | PASS | Renders per team, provenance-labelled |
| People page | PASS | Statuses, discovered teams, invite controls |
| Organization graph | PASS (code + earlier render) | Only `complete` interviews aggregate; empty states covered |
| Interview status | PASS with gap | `in_progress`/`complete` correct; **`analysis_failed` is invisible** — shows as "In conversation", excluded from counts (BL-19) |
| Resume status | PASS | In-conversation shows immediately (checkpointing) |
| Completed status | PASS | Immutable, report attached |

**Not verified in this audit (honestly):** live Claude turns and report quality (no `ANTHROPIC_API_KEY` in any local environment — this remains open issue §11#2 in PROJECT_STATE.md); microphone/TTS runtime behaviour; real iOS/Android devices (mobile tested at 375×812 viewport only); production Netlify behaviour (everything server-side was tested against `netlify dev`).

---

## 2 · The three release blockers

**P0 — BL-1: Production interview turns die at ~30s with a 502.** Known issue, now with a fully traced causal chain: every turn POSTs the client's *entire* interviews map plus the transcript again (payload grows monotonically; admin runs can approach Netlify's 6 MB cap) → the turn is a **non-streaming** Opus call with structured output inside a synchronous function → `netlify.toml` sets **no** `[functions]` timeout → the function is killed and Netlify answers 502. Root cause in production remains log-unconfirmed (that log is still step 1), but every link of the chain is verified in source. Compounded by BL-3.

**P0 — BL-2: The Welcome screen's primary button destroys a resumable interview.** Reproduced: seeded interview with two answers → reopened link → clicked "I'm ready — let's begin" (the visually dominant button) → context form → new interview checkpointed over the old one. Both answers unrecoverable. A returning participant taking the obvious path wipes their own work.

**P0 — BL-3: A live AI failure mid-conversation dead-ends the interview.** The opening falls back to the offline interviewer; **turns do not**. On any live failure (timeout, truncation, refusal) the participant sees a raw error string and can only retry into the same failure. Answers are safe (checkpointed first), but the interview cannot be completed — in production, BL-1 triggers this for everyone after enough turns. Violates the codebase's own invariant ("live errors silently fall back to simulated mid-conversation").

---

## 3 · Major issues (P1) in one paragraph each

**BL-4 Two-tab data loss [reproduced]:** second tab's answer refused as stale, client drops it as acknowledged, UI shows it saved; close that tab and it's gone. **BL-5 Deleted-person resurrection [code-proven]:** `deletePerson` leaves the invite active; the participant's next checkpoint recreates the interview, submit recreates the person — an admin cannot actually delete an active participant. **BL-6 "Re-interview" destroys a transcript with no confirmation [code-proven]:** one misclick on the report screen wipes messages+facts server-side, unrecoverable, and leaves a half-reset zombie record. **BL-7 Screen-reader users never hear the consultant [code-proven]:** the chat log has no `aria-live`/`role="log"`; a blind participant hears "Reading your answer" forever and none of the questions. **BL-8 iOS keyboard hides the composer [code-proven]:** conversation uses `100vh`, not `dvh`; on iPhone the Send button sits under the keyboard exactly while typing. **BL-9 Mic denial is silent [code-proven]:** every SpeechRecognition error collapses to "stop pulsing"; a participant who chose voice and denied the mic gets no feedback at all. **BL-10 Blank chat at the start [code-proven]:** between "Start the conversation" and the opening message there is dead air with an enabled composer — the first impression on the live engine is an empty screen.

---

## 4 · P2/P3 summary

Fifteen P2s and ten P3s are itemised in the backlog, the most consequential being: `analysis_failed` invisible to the Innovation Team and missing from dashboard counts (BL-19); localStorage-quota failure silently voiding the durability guarantee in Safari private mode (BL-16); admin disable/regenerate mid-interview silently discarding a buffered answer (BL-17); no double-submit guard causing duplicate analyses and double Anthropic spend (BL-21); a stale/rotated admin token rendering an empty dashboard with no re-prompt (BL-23); and the welcome list rendering with dead spacing classes — visibly cramped, bullets invisible — on the first screen every participant sees (BL-24, screenshot-confirmed).

## 5 · What already holds (verified strengths)

Checkpoint/resume held up under everything I threw at it short of the multi-tab case: refresh, browser close, server restart, network loss with unprompted recovery, revision monotonicity against stale replays, immutability of completed interviews (including against ghost writes from stale tabs), `analysis_failed` resumability, cross-person write rejection. The dashboard aggregates only completed interviews everywhere; old Blob records without the new fields cannot crash any screen; the analysis fallback chain can't strand an interview in `generating`; reduced-motion, focus-visible, error `role="alert"`, and the 16px input size (no iOS zoom) are all correctly in place.
