# Stabilization Backlog — CYRA Discovery

**Date:** 2026-07-17 · Companion to `PRODUCTION_READINESS_REPORT.md`.

> **Status update (same day, implementation phase):**
> **BL-2 FIXED + VERIFIED** — resumable Welcome now shows a single "Continue where I left off" action; server refuses transcript-shrinking checkpoints (`ignored:'shrink'`). Re-ran the original reproduction: both seeded answers survive.
> **BL-3 FIXED + VERIFIED** — turns now fall back to the offline interviewer silently (mirroring the opening); server detects `max_tokens` truncation and returns clean messages; raw exception strings never reach participants. Verified live: failing `/api/ai` → conversation continued, no error banner, `mode:'simulated'` checkpointed.
> **BL-1 (a) + (b) FIXED + VERIFIED LOCALLY** — `/api/ai` payload is now `{action, token, model, personId, participant, messages}` (~364 bytes measured vs the whole org dataset); prior findings derive server-side from `allInterviews()` (also closes BL-14); turn call runs `effort:'low'` and checks `stop_reason`.
> **BL-1 (c) + production acceptance — OWNER ACTIONS, OPEN:** raise the function timeout in Netlify site config; read the `api` function log for one failed invocation (still the root-cause proof); then run one real interview with the API key set and confirm `mode:'live'` on the stored record. Even if a turn still times out, BL-3 now degrades it to a seamless offline turn instead of a dead conversation.
> Regression state after all three: `npm run typecheck` clean · production build clean · contract suite 18/18 · browser: resume, offline-turn recovery, wire format, full E2E submit all pass. **P1 queue (BL-4…BL-10) not started.**
>
> **Second update (experience phase, same day — see `INTERVIEW_EXPERIENCE_REVIEW.md`):**
> production verification PASSED (resume + continuity confirmed by the owner, no data
> loss). The experience review then found the invisible-text root cause (dead off-token
> utility classes under the replaced Tailwind theme — `text-white` rendered participants'
> own words ink-on-ink) and fixed the whole family across Portal/Dashboard/Graph.
> **Closed in this phase: BL-8 (dvh), BL-9 (mic-denial feedback), BL-10 (pre-opening
> state), BL-24, BL-25, BL-26 (focus management), BL-29, BL-30, BL-36.**
> **Still open: BL-4 (two-tab merge), BL-5 (delete resurrection), BL-6 (re-interview
> confirm), BL-7 (chat aria-live)** — next in the P1 queue — plus the P2 batch.
> Conversation-intelligence recommendations (review §6) await joint review.
Order of execution: P0s one at a time, full regression after each; then P1s; then P2s. Nothing below P2 blocks the pilot.
Effort scale: S (<1h) · M (1–3h) · L (3h+). Evidence tags: [reproduced] = executed this audit; [code] = traced with file:line.

**Standing regression suite (run after EVERY fix):**
`npm run typecheck` · `node scratchpad/verify-checkpoint.mjs` (16 checks against `npx netlify dev`) · browser pass: fresh invite → context → 3 turns → refresh → resume → offline turn → reconnect → wrap up → submit → complete → completed-link notice → dashboard shows it.

---

## P0 — release blockers

### BL-1 · Production turn dies at ~30s with 502
- **Description:** Live interviews fail after several turns; `POST /api/ai` returns 502 at ≈30.7s (owner's observability). The offline fallback then masks it server-side for the *analysis*, but not for turns (BL-3).
- **Root cause (chain, each link verified in source; production log still unconfirmed — reading it stays step 1 of the fix):**
  1. `src/engine/claude.ts:19-36` — every turn sends the client's whole `interviews` map + the full transcript again (transcript effectively serialized twice; admin runs send the entire org dataset every turn, ~3-5 MB at 50 interviews vs Netlify's 6 MB cap).
  2. `netlify/functions/_ai.mts:68-72` — the turn is a **non-streaming** `messages.create` (Opus, `max_tokens: 2000`, json_schema, default effort `high`) inside the synchronous function; output grows with accumulated facts, so later turns are slower — matching "fails after a few turns".
  3. `netlify.toml` — no `[functions]` timeout configured.
- **Evidence:** [code] all three links; [reported] the 30.7s/502 observation; SDK retry stacking (2× on 429/529) is the alternate mechanism the log would distinguish.
- **Fix plan (smallest set, no architecture change):**
  (a) Stop sending `interviews` from the client; server derives `priorFindingsFor` from `allInterviews()` in `_ai.mts` (also fixes BL-14 dead feature + injection surface).
  (b) Add `output_config: { effort: 'low' }` to the turn call and check `stop_reason === 'max_tokens'` before parsing (turns are short conversational steps; depth belongs to the background report, which stays untouched).
  (c) Raise the function timeout to the Netlify maximum (site config / `[functions]` block).
  (d) BL-3's per-turn fallback makes any residual timeout survivable.
- **Effort:** M · **Dependencies:** production verification requires the owner (function log before, one live interview after; acceptance test = PROJECT_STATE §12 step 4).
- **Regression tests:** standing suite; verify `/api/ai` body no longer contains `interviews`; verify a turn with a fake oversized interviews map is ignored server-side; live: one full interview with `mode:'live'` stored.

### BL-2 · Welcome's primary button destroys a resumable interview
- **Description:** With an unfinished interview, Welcome shows resume as a *secondary* button while the primary "I'm ready — let's begin" starts over; startConversation checkpoints a fresh interview at a higher revision over the old one.
- **Root cause:** `src/screens/Portal.tsx` Welcome renders both paths unconditionally; `startConversation` never checks for existing server-held work.
- **Evidence:** [reproduced] seeded 2 answers → clicked begin → server at revision 6, 1 message, both answers gone.
- **Fix plan:** When a resumable interview exists, render **one** primary action ("Continue where I left off") and no fresh-start path for participants. Belt-and-braces server guard: `/api/checkpoint` refuses a revision-bumping payload whose `messages` do not contain the stored transcript's user messages? — too clever; instead: refuse a checkpoint that would *shrink* `messages.length` below the stored count unless status is being legitimately reset by an admin. Client fix is primary; server shrink-guard is the safety net.
- **Effort:** S–M · **Dependencies:** none.
- **Regression tests:** standing suite + new contract check: checkpoint with fewer messages than stored → rejected/ignored; UI: resumable link shows exactly one begin/resume action; internal test-run restart still works (admin path).

### BL-3 · Live turn failure dead-ends the conversation (no fallback, raw error)
- **Description:** Mid-conversation live failures show raw strings ("Unexpected end of JSON input", "The model declined this request.") and every retry re-fails; interview cannot be completed. Only the opening falls back to the offline interviewer.
- **Root cause:** `src/screens/Portal.tsx` `send()` catch only calls `setError` (never flips `mode`); `_ai.mts:74` parses without try/catch or `stop_reason:'max_tokens'` check; `api.mts` propagates `err.message` verbatim; `Portal.tsx` displays any `Error.message` as-is.
- **Evidence:** [code] all paths; invariant stated in CLAUDE.md ("live errors silently fall back… mid-conversation") is not implemented for turns.
- **Fix plan:** In `send()`'s catch for live mode: run `simulatedTurn` on the same answer, flip `mode:'simulated'`, continue silently (mirror of the opening's fallback). Keep the checkpoint-before-AI ordering. Server: wrap parse, detect truncation, return a clean message. Client: never render server `Error.message` verbatim for turn failures — use the friendly copy.
- **Effort:** M · **Dependencies:** none (independent of BL-1; also the mitigation for it).
- **Regression tests:** standing suite + forced-failure test: block `/api/ai` in the browser → send a turn → conversation continues in simulated mode, no error banner, answer checkpointed; transcript shows both engines' turns in order.

---

## P1 — major

### BL-4 · Two tabs: second tab's answers silently discarded
- **Root cause:** server correctly ignores stale revisions (`api.mts` `ignored:'stale'`), but `store.tsx` `flush()` treats *any* ack — including `ignored` — as delivered and drops the outbox entry; the tab's UI keeps the message locally.
- **Evidence:** [reproduced] tab B answer absent from server, outbox `null`, UI showing it.
- **Fix plan:** On `ignored:'stale'`: fetch the server interview, `adoptInterview` it, surface a quiet notice ("This conversation continued in another window — showing the latest"), and do NOT silently drop a user message: re-apply the local user message on top of the adopted state as a new revision (append-merge; user messages are never lost, AI replies may be re-asked).
- **Effort:** M · **Regression tests:** two-tab script: answer in A then B → both user answers on server after B's merge; standing suite.

### BL-5 · Deleting a person doesn't stick (checkpoint resurrects)
- **Root cause:** `_store.mts` `deletePerson` deletes person+interview but not the invite; `/api/checkpoint` with `stored === null` passes every guard and re-writes.
- **Evidence:** [code] full trace; invite lifecycle confirmed live.
- **Fix plan:** `deletePerson` also deletes the person's invites (needs an invites-by-person scan — small); `/api/checkpoint` refuses when `getPerson()` is null (`410 gone`, terminal for the client outbox).
- **Effort:** S–M · **Regression tests:** contract additions: delete person mid-interview → checkpoint → 410 and nothing recreated; submit → 403/410; standing suite.

### BL-6 · "Re-interview" wipes a transcript with no confirmation + zombie reset
- **Root cause:** `Report.tsx:35` → `App.tsx:152` calls `resetInterview` directly (no `confirm()`, unlike People's Remove); `store.tsx` reset keeps `report/opportunities/completedAt/...` on the record.
- **Evidence:** [code].
- **Fix plan:** `confirm()` with explicit copy ("permanently deletes this transcript and report"); reset writes a clean `newInterview`-shaped record (status `not_started`) instead of a partial spread.
- **Effort:** S · **Regression tests:** UI: cancel leaves record untouched; confirm produces a record with no report/opportunities/completedAt; dashboard counts drop accordingly.

### BL-7 · Chat log is silent to screen readers
- **Fix plan:** `role="log" aria-live="polite"` on the message container (`Portal.tsx:686`).
- **Effort:** S · **Regression tests:** aria attributes present; VoiceOver spot-check when a device is available.

### BL-8 · iOS keyboard hides the composer (100vh)
- **Fix plan:** `h-[calc(100dvh-64px)]` (keep `100vh` fallback via `supports`).
- **Effort:** S · **Regression tests:** desktop layout unchanged (screenshot diff); manual iPhone check at pilot start.

### BL-9 · Mic permission denial is silent
- **Fix plan:** branch `rec.onerror` on `e.error`: `not-allowed`/`audio-capture` → `setError` with actionable copy ("Your browser blocked the microphone — enable it in site settings, or keep typing."); `no-speech` → gentle hint. Keep listening-state reset.
- **Effort:** S · **Regression tests:** simulate error events on the rec object; error banner shows; typing still works.

### BL-10 · Blank chat before the opening message
- **Fix plan:** render `WorkingRule stage="The consultant is joining"` while `messages.length === 0`, disable Send until the opening lands.
- **Effort:** S · **Regression tests:** UI: indicator visible pre-opening, composer disabled, opening replaces it.

---

## P2 — minor (batchable after P1)

| ID | Issue | Root cause / evidence | Fix plan | Effort |
|---|---|---|---|---|
| BL-14 | Cross-interview memory dead for participants + prompt-injection surface | `_ai.mts:47` trusts client `body.interviews`; participants send an empty map [code] | Fixed by BL-1a (server-side `allInterviews()`) | folded |
| BL-16 | localStorage quota/private-mode voids durability silently | `store.tsx` `writeOutbox` swallows; `flush()` re-reads storage so the entry is neither saved nor sent [code] | `checkpoint()` falls back to a direct send when the WAL write fails; surface a banner if both fail | M |
| BL-17 | Admin disable/regenerate mid-interview discards the participant's buffered answer | 403 treated as terminal → outbox dropped [reproduced via curl] | Keep 401/403 buffered for one session (retry window), and show the participant "this invitation was deactivated" instead of silence | M |
| BL-19 | `analysis_failed` invisible to the team; excluded from counts; no retry | `org.ts` maps it to `in_progress`; `Dashboard.tsx:61` omits it; no admin re-run [code] | Distinct "Report failed" tag in People + include in a visible count + "Retry report" button that re-fires `analysis-background` | M |
| BL-20 | Invite generate/regenerate failures swallowed | `People.tsx:203,214` un-guarded `void generate()` [code] | wrap in existing `guard()` | S |
| BL-21 | No double-submit guard; resubmit during `generating` runs a second analysis | `Portal.tsx submit()` has no in-flight lock; `api.mts` submit doesn't block `generating` [code] | in-flight state + disabled button; server: submit while `generating` returns current status without re-firing | S |
| BL-22 | Stale tab accepts answers into a completed interview with no feedback | checkpoint 409 is terminal-dropped; UI keeps chatting [reproduced] | On 409 ack: adopt server state → flips tab to done/completed view | S (with BL-4 plumbing) |
| BL-23 | Wrong/rotated admin token → empty dashboard, no re-prompt | `App.tsx:67` trusts token presence; 401 only sets `loadError` [code] | On 401 from `fetchState`: clear token, return to gate with message | S |
| BL-24 | Welcome bullets: dead classes (`space-y-4.5`, `h-1.5`, `w-1.5`) → cramped list, invisible bullets | replaced Tailwind scale has no fractional steps [reproduced, screenshot] | `space-y-4`, `h-2 w-2` | S |
| BL-25 | Sub-44px tap target: "Continue the conversation instead" | `Portal.tsx:847` bare text link [code] | `.btn-tertiary` or `min-h-touch` | S |
| BL-26 | No focus management across step transitions | no `.focus()`/`autoFocus` anywhere in Portal [code] | focus the new step's h1 (`tabIndex={-1}`) on step change | M |
| BL-28 | Flush retry has no backoff; 500s retry forever every 5s | `store.tsx` interval [code] | exponential backoff capped at 60s; reset on success/online | S |

## P3 — cosmetic / latent

| ID | Issue | Fix | Effort |
|---|---|---|---|
| BL-27 | Clipboard failure silent; visible fragment ≠ copied URL | show full URL, "copy failed — select manually" fallback | S |
| BL-29 | `ADDED ✓` glyph + literal caps (voice rule) | `Added` via Tag/success tone | S |
| BL-30 | Heading punctuation drift ("A little context about you", "What I understood") | add periods | S |
| BL-31 | No expiry concept for invitations (mandatory-workflow gap; disable covers it) | product decision — document or add TTL | — |
| BL-32 | `sendBeacon` >64 KB no-ops on very long interviews | skip beacon when oversized (outbox already covers reload) | S |
| BL-33 | Voice mode not restored on resume | persist `voiceMode` per interview | S |
| BL-34 | Hash change without reload doesn't re-route (module-load routing) | known demo chrome; document | — |
| BL-35 | Simulated analyst names team after designation ("Engineer" as a team) | improve `inferDepartmentName` fallback copy | S |
| BL-36 | Message-bubble className double spaces (possible lost class) | tidy | S |
| BL-37 | `resetInterview` leaves derived fields (folded into BL-6 fix) | — | — |

---

**Sequencing:** BL-2 → BL-3 → BL-1(a–c) [P0s, full regression after each] → BL-4, BL-5, BL-6 → remaining P1s (BL-7…BL-10) → P2 batch. BL-1's production acceptance (live interview with the key set, function log before/after) needs the platform owner and is the pilot's gate.
