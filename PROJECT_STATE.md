# PROJECT_STATE — CYRA Discovery

**Written:** 2026-07-17 · **Purpose:** hand a new session the full picture with zero context loss.
**Read `CLAUDE.md` first** for the architectural rules; this file is the *current situation*.

> **Evidence discipline.** This document separates **verified** (I ran it and saw the result),
> **reported** (the platform owner observed it; I have not), and **suspected** (reasoned, untested).
> The 502 in §7 is **reported, not reproduced**. Nothing here is invented to fill a gap.

---

## 1 · Current architecture

An AI interviewer that discovers how Cyrix Healthcare actually works. **PERSON is the primary
entity; the organization is discovered, never predefined** — there is no department roster in the
codebase, and reintroducing one is a regression.

Two experiences, split by URL hash (parsed once at module load in `src/App.tsx`, no router):

| Route | Who | What |
|---|---|---|
| `#invite/<token>` | Participants | **Discovery Portal** (`screens/Portal.tsx`). Welcome → context → conversation (voice/text) → "What I understood" → submit → thank you. No nav, no reports, no hint the rest exists. |
| `#innovation` (landing = Dashboard), `/people`, `/graph` | Innovation Team | Dashboard, People (roster + invitations), Graph, Reports, Settings. |
| bare URL | anyone | "This conversation is by invitation." |

**Stack:** Vite 6 + React 18 + TS (strict) + Tailwind 3 · Netlify Functions + Netlify Blobs.

**Two engines, one contract** (an invariant — it has broken twice):
- **Live:** browser → `POST /api/ai` → `netlify/functions/_ai.mts` → Claude. The browser holds no key.
- **Offline:** `src/engine/simulated.ts` — regex-signal interviewer + synthesised analysis. If Claude
  is unreachable, the **server** falls back to it so a participant's 20 minutes never dead-end.

**Why the report is a background function:** a 16k-token analysis takes ~40–90s, far past the
synchronous function budget. `analysis-background.mts` runs it; the client polls
`GET /api/interview/:token`. This is why the portal's copy ("you can leave and come back") is true.

### Files that matter

```
netlify/functions/
  api.mts                  sync router, Config.path = '/api/*'   ← routes itself; no redirect
  analysis-background.mts  the long report + person back-fill
  _store.mts               Netlify Blobs — THE STORAGE SEAM
  _ai.mts                  Claude — THE KEY SEAM (imports src/engine/prompts.ts unchanged)
src/
  api.ts        the only client code that knows a backend exists
  store.tsx     React context; same API as before, writes through to the server; polls 15s
  org.ts        the emergent org: departments/relationships/status derived from interviews
  invites.ts    token generation + format checksum
  types.ts      domain model (§6)
  engine/       prompts.ts (shared with the server), claude.ts (transport only), simulated.ts
  screens/      Portal · Dashboard · People · Graph · Report · Settings
  tokens.ts     JS access to CYRA tokens (for SVG fills, which can't use CSS classes)
cyra-tokens.json → scripts/build-tokens.mjs → src/tokens.css   (generated; prebuild regenerates)
```

---

## 2 · Repository status — **verified**

- **Remote:** `https://github.com/cyra-cyrix/cyrix-discovery.git` · branch `main` · **PUBLIC**
- **In sync with `origin/main`; working tree clean.**
- History:
  ```
  be33096  Simplify the invitation to name and email        ← HEAD, deployed
  d06e0bc  Add shared persistence: multi-device pilot
  ab383a5  People-first rearchitecture; adopt CYRA Design System
  d5d4656  Initial commit - CYRIX Discovery
  ```
- **39 tracked files** (was 5,704 — `node_modules` and `dist` were committed; `.gitignore` added in `d06e0bc`).
- `.env` is gitignored and has never been committed. No API key has ever been committed.
- ⚠️ The retired access code `cyrix2026` remains in **git history** (`d5d4656`) on a public repo.
  It is inert — the gate is now server-verified — so this is housekeeping, not exposure.

---

## 3 · Deployment status — **verified 2026-07-17**

- **Live:** https://cyrix-discovery.netlify.app — HTTPS, auto-deploys from `main`.
- The deployed bundle hash matched the local build at each push, so **HEAD (`be33096`) is live**.
- Connected via Netlify's GitHub App (not a repo webhook — `/hooks` is empty and
  `/deployments` returns 0; **this is normal and is not evidence of disconnection**).
- ⚠️ **Correction (2026-07-17): `netlify-cli` IS available** — it is in `devDependencies`, at
  `node_modules/.bin/netlify`. It is simply not on `PATH`, which is why a bare `which netlify`
  reports nothing and an earlier session concluded it was absent. Use `npx netlify …`.
  `npx netlify dev` runs the real functions + Blobs locally and was used to verify the
  checkpointing work end to end. Reading **production** logs additionally needs
  `npx netlify link` + an authenticated account, which I still do not have — but
  `npx netlify logs:function api` is the command to reach for once linked.

---

## 4 · Netlify configuration (`netlify.toml`)

```toml
[build]    command = "npm run build" · publish = "dist" · functions = "netlify/functions"
[dev]      command = "npm run dev" · targetPort = 5174 · port = 8888 · framework = "vite"
```
- **No `/api/*` redirect.** `api.mts` declares `export const config = { path: '/api/*' }` and routes
  itself. A redirect to `/.netlify/functions/api/:splat` **bypasses that pattern and strips the
  route splat** — this was a real bug; do not re-add it. `routeOf()` in `api.mts` derives the route
  from the URL so either entry shape works.
- SPA fallback `/*` → `/index.html` **must stay after** the API. In `netlify dev` it also swallowed
  Vite's module requests until `[dev] framework = "vite"` was set.
- Headers: `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`; `/api/*` is `no-store` + `noindex`.
- **No `[functions]` timeout is configured** → the Netlify default (**10s synchronous**) applies.
  This matters — see §7.
- **Netlify Drop cannot deploy this.** It skips functions, so there'd be no backend.

---

## 5 · Environment variables required

Set in **Site configuration → Environment variables**, then redeploy.

| Variable | Required | Purpose | If missing |
|---|---|---|---|
| `ADMIN_TOKEN` | **yes** | Innovation Team credential, verified **server-side** in `api.mts` (`isAdmin`). | Every admin route 401s — **nobody can sign in, including the owner**. Fails closed. |
| `ANTHROPIC_API_KEY` | **yes** | Server-side Claude. Participants hold no key. | Pilot still runs, but every participant gets the **offline** interviewer and an offline report. Reports read generically rather than failing loudly. |

**Never prefix either with `VITE_`** — that compiles into the public bundle.
Netlify Blobs needs no configuration; it is provisioned automatically.
Local: copy `.env.example` → `.env` (gitignored), then `netlify dev`.

---

## 6 · Data model (`src/types.ts`) — unchanged by the backend move

```ts
Person { id, name, designation, email, phone, state, reportingManager, department, createdAt }
Invite { token, personId, createdAt, status: 'active'|'disabled', completedAt }
Interview {
  personId, departmentName: string|null,     // DISCOVERED, not declared
  status: 'not_started'|'in_progress'|'generating'|'complete'|'analysis_failed',
  mode: 'live'|'simulated', startedAt, completedAt, inviteToken, participant: ParticipantContext|null,
  messages[], facts[], coverage: Coverage,   // 10 discovery dimensions, 0..1 each
  profile, report, opportunities[], edges[]  // edges = free-text team→team dependencies
}
```

**Storage** (Netlify Blobs, keys mirror the domain maps): `people/<id>` · `invites/<token>` ·
`interviews/<personId>`. Only `settings` (model picker) and the admin token stay in localStorage.

**Invitation is name + email only.** Designation/state/department are **deferred, not dropped** —
the interview writes them back (`Portal.submit` → `api.mts` merge → `analysis-background`
back-fills the discovered team). A value the Innovation Team typed always beats an inferred one.
`PersonForm` (edit) keeps all seven fields as the enrichment surface.

---

## 7 · Current production issue (HTTP 502) — **REPORTED, NOT REPRODUCED**

**Status:** the platform owner reports a 502. **I could not reproduce it from outside**, because
every code path that could plausibly cause one is behind a credential I do not have.

### What I verified (2026-07-17, live site)

| Probe | Result | What it proves |
|---|---|---|
| `GET /` | **200** | Site + CDN healthy |
| `GET /api/state` (no auth / wrong bearer) | **401** | `api.mts` runs; auth fails closed |
| `GET /api/invite/zzzznotatoken` | **200** `{"decision":"unknown"}` | **`_store.mts` is bundled and Netlify Blobs works in production** |
| `GET /api/interview/zzzznotatoken` | **404** | Router + store fine |
| `POST /api/ai` (no auth / bogus token) | **403** | Auth **short-circuits before** the Claude call |
| `POST /api/submit` (bogus token) | **403** | Auth fine |
| `PUT /api/person` (no auth) | **401** | Admin writes gated |
| `POST /.netlify/functions/analysis-background` | **202** | Background function deploys and queues |

**No 502 anywhere reachable.** Note what the 403s mean: the auth check returns *before*
`await import('./_ai.mts')` and before any Claude call — so **the slow path has never been
exercised by me, in any environment.** I never had an API key; every test I ran used the
offline fallback. I flagged this gap when I shipped the backend; §7 is that risk materialising.

### The decisive signal

**A thrown error in `api.mts` returns 500, not 502** — the whole handler is wrapped in
`try/catch → json({error}, 500)`. So a 502 is *not* an exception in my code. **502 is what
Netlify/Lambda returns when a function times out or crashes without a response.**

That narrows it sharply.

---

## 8 · Evidence collected so far

1. All eight probes above (§7 table) — collected today against the live site.
2. `_ai.mts` runs **`claude-opus-4-8`**, `max_tokens: 2000`, large system prompt, `json_schema`
   structured output — **synchronously**, inside `POST /api/ai`.
3. **No `[functions]` timeout is set** in `netlify.toml` → Netlify's default **10s** applies.
4. Blobs and the underscore-prefixed `_store.mts` demonstrably work in production (the
   `/api/invite/...` 200 could only come from a Blobs read), so *static* imports of `_`-files bundle fine.
5. The analysis was deliberately made a **background** function precisely because it exceeds the
   sync budget — the same reasoning was **not** applied to turns, on my assumption they were "short".
6. Local `netlify dev` exercised every route successfully **with the offline engine only**.

---

## 9 · Suspected causes — ranked

**H1 — `POST /api/ai` exceeds the function timeout. (High confidence — but this entry's
original reasoning was wrong; corrected 2026-07-17.)**
The conclusion stands: it is the only *slow synchronous* path, it requires `ANTHROPIC_API_KEY`
(so it appears only once the owner set the env vars), and Lambda answers a timeout with **502**.

Two corrections to what this section used to claim:
- **Not "adaptive thinking".** `_ai.mts` passes **no** `thinking` parameter, and on Opus 4.8
  omitting it means the model runs *without* thinking. Thinking is not the cause.
- **Not 10 seconds.** The owner's observability reports a duration of **≈30.7s**. Whatever
  limit is in effect it is not the 10s default assumed in §4/§8 — do **not** go into the log
  looking for `Task timed out after 10.00 seconds`; read the duration it actually reports.

*Better-grounded mechanism (still unproven):* the turn call is **non-streaming** with
`max_tokens: 2000`, a `json_schema` structured output, and effort defaulting to `high`. The
report path already uses `.stream()`; the turn path does not. Anthropic's guidance is to stream
anything with long output or high `max_tokens` precisely to avoid request timeouts. Onset fits:
each turn returns `reply` + `facts[]` + `coverage`, so **output** grows as the conversation
accumulates facts, approaching the 2000-token cap — early turns pass, later turns cross the
budget. A second candidate the log would also distinguish: the SDK retries 429/529 twice by
default with backoff, which can stack to ~30s of wall clock.
*Discriminator:* the Netlify Functions log for `api` on a failed invocation.

**H2 — Dynamic `await import('./_ai.mts')` fails to resolve in the bundle. ~~(Low–medium.)~~
RULED OUT 2026-07-17.** The owner reports interviews start and Claude asks *several questions*
before the 502. Every one of those turns — including the opening — goes through the same
`await import('./_ai.mts')` in `api.mts`. If the module could not resolve, turn one would fail.
It resolved repeatedly. This is settled by observed behaviour, not reasoning.

**H3 — Payload/`@anthropic-ai/sdk` cold-start cost. (Low.)**
The SDK bundled into `api` inflates cold start; a cold start plus an Opus turn makes H1 worse
rather than being a separate cause.

**Ruled out:**
- ~~`ANTHROPIC_API_KEY` unset~~ → `_ai.mts` throws → caught → **500** with a clear message, not 502.
- ~~SPA fallback shadowing `/api/*`~~ → probes return JSON, not HTML.
- ~~Blobs unconfigured~~ → the `/api/invite` 200 disproves it.
- ~~Bad deploy~~ → bundle hash matches HEAD.

---

## 10 · Files changed recently

`be33096` (HEAD) — invitation simplified to name + email:
`src/screens/People.tsx` (InviteForm added; PersonForm → enrichment) · `src/screens/Portal.tsx`
(submit enriches the person) · `netlify/functions/api.mts` (merge person on submit) ·
`src/store.tsx` (**fixed:** `mounted` ref not re-armed after StrictMode remount → roster rendered
empty against a populated server).

`d06e0bc` — the backend: `netlify/functions/*` (new) · `src/api.ts` (new) · `src/store.tsx`
(localStorage → shared) · `src/engine/claude.ts` (transport only) · `src/screens/Settings.tsx` ·
`src/App.tsx` (server-verified gate; `ACCESS_CODE` deleted) · `.gitignore` (new) · `netlify.toml`.

`ab383a5` — people-first + CYRA Design System: deleted `src/data/departments.ts`,
`screens/Home.tsx`, `screens/Invites.tsx`; added `src/org.ts`, `screens/People.tsx`,
`cyra-tokens.json`, `scripts/build-tokens.mjs`, `src/tokens.ts`; rewrote `tailwind.config.js`.

---

## 11 · Open issues

| # | Issue | Severity |
|---|---|---|
| 1 | **The 502 (§7).** Root cause still **unproven** — needs the function log. Now *survivable*: checkpointing (§13) means a participant keeps every answered turn and can resume, so it degrades a lost interview into a stalled turn. That is containment, **not a fix**. | **Blocker** |
| 2 | **The live Claude path has never been executed** — no API key in any of my environments. Turn latency, report quality and cost are all unmeasured. The durability work was verified against the **offline** engine (which is the honest test for durability, but says nothing about turn latency). | **High** |
| 3 | "Send invitation" **sends no email** — it creates the invite and copies the link. Overstates the action; CYRA 11 §3 says buttons state exactly what happens. Fix by wiring email or relabelling "Create invitation". | Medium |
| 4 | **Design compliance Phases 4–8 outstanding** — H3 (chat bubbles vs document), H4 (chromatic charts), H5 (part), M1–M3, M7–M9. See `DESIGN_COMPLIANCE_REPORT.md` §5. | Medium |
| 5 | **C5 not fully closed** — machine output is labelled `DRAFT — UNVALIDATED`, but there is **no expert review gate**. The platform's core law ("nothing becomes knowledge until an expert approves it") needs a workflow = a feature decision (E6). | Medium |
| 6 | ~~An invitation is single-use; a participant who abandons mid-conversation needs a regenerated link.~~ **CLOSED 2026-07-17** by §13 — the link resumes, and the transcript is server-side from the first turn. | ~~Low~~ |
| 7 | Open DS decisions **E4** (nav: rail vs tabs) and **E5** (ratify Graph/Founder Brief/Opportunity Card as reference implementations) remain unratified. | Low |
| 8 | `cyrix2026` in git history on a public repo (inert). | Low |
| 9 | **No retry path for `analysis_failed`.** The state is now real, resumable and surfaced to the participant ("submit again"), but the Innovation Team has no one-click re-run of the analysis for one. | Medium |
| 10 | **Blobs writes are not atomic.** `_store.mts` is read-then-`setJSON` with no compare-and-swap. The `revision` guard makes the checkpoint path safe against stale retries, but two *simultaneous* writers at the same revision could still interleave. Not reachable in the pilot (one participant, one device, one interview); revisit before any concurrent-editor feature. | Low |

---

## 12 · Next recommended steps

> **Update 2026-07-17 (stabilization phase):** a full production quality audit was run — see
> `PRODUCTION_READINESS_REPORT.md` (findings, evidence) and `STABILIZATION_BACKLOG.md`
> (fix plans + live status). The three P0s are implemented and locally verified: BL-2
> (Welcome no longer offers a destructive fresh-start over a resumable interview; server
> refuses transcript-shrinking checkpoints), BL-3 (turns now fall back to the offline
> interviewer mid-conversation — the 502 no longer dead-ends anyone), BL-1a/b (`/api/ai`
> no longer ships the client's interviews map — prior findings derive server-side; turn
> runs at `effort:'low'`). **Steps 1–2 below remain the owner's** — the log is still the
> root-cause proof, and the timeout raise + live acceptance test still stand.
>
> **Deployed 2026-07-17:** commit `cfeb6df` ("Stabilization milestone: fix all three P0
> release blockers") pushed and confirmed live — production serves the P0 bundle
> (`index-CoC6hC4a.js`, content-hash unique to this tree) and all six function probes
> pass (site 200 · invite lookup 200/Blobs healthy · state 401 · checkpoint 403 ·
> ai 403 · submit 403; the clean checkpoint 403 also confirms the local-dev 401 was the
> `netlify dev` .html-fallback artifact). **Production verification gate before any P1
> work:** (1) owner reads the `api` function log for a failed invocation — root-cause
> proof for BL-1; (2) owner raises the function timeout (Site config → Functions);
> (3) one real interview with `ANTHROPIC_API_KEY` set, confirming `mode:'live'` on the
> stored record and that turns survive past the old failure point; (4) the multi-device
> smoke test (DEPLOY_NETLIFY.md §6). Even a residual turn timeout now degrades to a
> seamless offline turn (BL-3) instead of a dead conversation.

**Do these in order. Step 1 is diagnosis — do not fix before reading the log.**

1. **Read the Netlify function log** (Site → Logs → Functions → `api`), reproduce by starting one
   interview, and look at the failing invocation. This single step decides H1 vs H2:
   - `Task timed out after 10.00 seconds` → **H1**
   - `Cannot find module './_ai.mts'` → **H2**
   Nothing below should be attempted before this; both fixes are cheap, and guessing wastes the
   evidence that's sitting in the log.

2. **If H1 (expected):** a synchronous Opus turn does not fit a 10s budget. In increasing order of robustness:
   - **Fast:** switch the turn model — `Settings` already has a picker; default `claude-opus-4-8`
     → `claude-sonnet-5` or `claude-haiku-4-5` in `_ai.mts` `DEFAULT_MODEL`, and add
     `output_config: { effort: 'low' }` for turns. Keep **Opus for the report** (it's already
     background and unconstrained — that's where depth actually matters).
   - **Also:** raise the function timeout (Netlify allows up to 26s; Site config → Functions).
   - **Robust:** stream the turn, or move turns to the background+poll pattern the analysis uses.
     Only do this if the first two don't hold — it costs conversational latency.
   - Then **measure real turn latency** before inviting anyone.

3. **If H2:** replace `const { runTurn } = await import('./_ai.mts')` in `api.mts` with a static
   top-level import and redeploy.

4. **Run one real interview end to end with the key set**, and confirm `mode: 'live'` (not
   `'simulated'`) on the stored interview. **This is the acceptance test for the whole pilot** —
   everything to date has run on the fallback engine.

5. **Then** the multi-device smoke test in `DEPLOY_NETLIFY.md` §6: invite → open on a phone →
   complete → dashboard shows it within ~15s.

6. Only after the pilot is proven: issue #3 (email vs relabel), then Design Phases 4–8 (#4),
   then the review gate (#5).

---

## 13 · Interview durability — checkpointing & resume (added 2026-07-17) — **verified**

A product requirement, not an enhancement: the interview must survive a refresh, a closed
browser, a network failure and an AI failure.

**What was actually broken.** Not a durability *gap* — there was no persistence at all.
`store.setInterview` / `updateInterview` only ever touched React state (both were `async`,
returning promises that had written nothing), so a participant's conversation lived in browser
memory until submit. `PUT /api/interview` sits below the `isAdmin` gate, so no participant-side
write path existed to call. §6's old claim that mutations "write through to the server" was true
of people and invites, never of interviews.

**The design.** Two tiers, in this order, on every mutation:
1. **Outbox** (`cyra-checkpoint-outbox`, localStorage) — written **first**, so a turn survives a
   tab that dies before the request completes. Cleared on ack. See the CLAUDE.md amendment.
2. **`POST /api/checkpoint`** — participant-authenticated by the invitation token (or admin
   bearer for the internal test-run), same shape as `/api/submit`.

Each checkpoint is a **full snapshot**, so only the newest per person matters — the outbox is a
map keyed by personId, not a queue. No ordering to get wrong, no partial replay.
A monotonic `revision` on `Interview` is enforced server-side; `sendBeacon` on `pagehide` gives
a closing tab one more chance.

**Verified against real functions + Blobs (`npx netlify dev`), not reasoned about:**
- 16/16 on a contract script covering all seven requirements incl. stale-replay and cross-person
  authz (`scratchpad/verify-checkpoint.mjs`).
- Full UI walkthrough: two turns → server holds revision 6 / 5 messages mid-conversation →
  hard reload → "Continue where I left off" → complete transcript restored.
- **Offline test:** `fetch` to `/api/checkpoint` forced to reject → answer sent → server stranded
  at rev 6/5 msgs while the outbox held rev 8/7 msgs → network restored → retry landed the
  answer unprompted → outbox drained to `null`.
- `npm run typecheck` clean; no console errors.

**Not verified:** the live Claude path (no API key locally — the walkthrough ran on the offline
engine, see §11 #2), and production behaviour.

> **Local gotcha:** `netlify dev` re-probes a **403** against a `.html` static fallback, which
> re-enters the router as `head='checkpoint.html'`, matches nothing, and falls through to the
> admin gate — so the client sees **401** locally where production returns 403 (the function log
> shows the true 403; §7's live probes confirm production is correct). Don't chase this as a bug.

### Quick commands

```bash
npm run typecheck        # the ONLY real type check — build does not type-check
npm run build
npx netlify dev          # port 8888; real functions + Blobs. needs .env. NOTE: npx —
                         # netlify-cli is a devDependency, not on PATH (§3)
npx netlify link         # needed once before production logs are reachable
npx netlify logs:function api        # the §12 step-1 log; needs `link` + an account
curl -s https://cyrix-discovery.netlify.app/api/invite/zzzznotatoken   # → {"decision":"unknown"} = backend healthy
```
