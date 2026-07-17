# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Scope:** this file covers `cyrix-discovery/` only. The repo root holds a *separate, unrelated* app (Continuum, a rehab-hospital demo) with its own CLAUDE.md, design language and dev server (port 5173). Never mix code, data or design tokens between the two.

## What This Is

**CYRA Discovery** — the Discovery module of the CYRA platform: an AI-powered Organizational Discovery Platform for Cyrix Healthcare (India's largest biomedical equipment service org, ~1200 engineers). An AI interviewer holds a ~20-minute consultant-grade conversation with each participant, builds a knowledge model across **10 discovery dimensions** (`DIMENSIONS` in `src/types.ts` — value, flow, time, knowledge, knowledgeLoss, decisions, delays, manual, aiOpportunity, impact), then derives a 12-section discovery report, a classified AI-opportunity portfolio, a founder brief, and edges for a company-wide knowledge graph.

**PERSON is the primary entity — the organization is discovered, never predefined.** This is the load-bearing architectural rule: there is no department roster anywhere in the codebase (a predefined `data/departments.ts` was deliberately deleted). Invitations are issued to *people*; the department is a free-text field the participant may leave blank and the interview discovers (`departmentName` on `Interview`, written by the analysis); departments and their relationships are *derived* from completed interviews via `src/org.ts` (`discoveredDepartments`, `interviewDeptLabel`, `personStatus`). Never reintroduce a hardcoded department list, and never take a department from a URL.

Product stance (from the deployment brief, holds for all changes): **not a survey, not a chatbot**. Understanding first — AI opportunities must emerge from interview evidence, never from pitching. Trust, low friction and insight quality beat feature count. Refine; don't redesign.

## Two Experiences, Split by URL Hash

Routing is parsed **once at module load** in `src/App.tsx` (`parseRoute()`); there is no router library.

- **`#invite/<token>`** → **Discovery Conversation Portal** (`src/screens/Portal.tsx`) — the only surface participants ever see. The token identifies the *person invited*; their department is asked as optional free text and discovered by the interview. Tokens are self-validating (11 base36 chars + checksum); ALL validation lives in `src/invites.ts` (`lookupDecision`) — the single seam a future backend replaces. Flow: Welcome → Basic context → Conversation (voice or text, switchable mid-stream) → "What I understood" confirmation → Submit → Thank you. **No navigation, no settings, no reports, no hint that anything else exists.** Participants never see the generated report. The bare URL shows an invitation-required notice. A participant arriving without a roster record auto-creates one (`personFromContext`).
- **`#innovation` (= Dashboard, the landing page), `#innovation/people`, `#innovation/graph`** → **Innovation Dashboard** — everything else. **People** (`screens/People.tsx`) is the roster + invitation manager in one (add/edit person: name, designation, email, phone, state, reporting manager, optional department; generate/copy/regenerate/disable their link; status; completion date). Gated by a front-end access code (`ACCESS_CODE` in `App.tsx`, flag persisted in localStorage under `cyrix-innovation-access`). This is demo-grade gating — move behind real auth when a backend exists.
- **Deployment:** Netlify site + functions — `netlify.toml` + step-by-step `DEPLOY_NETLIFY.md`. Requires `ADMIN_TOKEN` and `ANTHROPIC_API_KEY` env vars; never put either in a `VITE_*` variable (it would be public). Netlify Drop cannot deploy the pilot — it skips functions.
- Internally, opening a not-yet-interviewed person renders the *same* `Portal` component with `internal` + `presetPersonId` props (nav stays visible; completion shows the report). There is deliberately **one** conversation implementation — do not fork a second interview UI.

## Two Engines, One Contract

Every interview runs on one of two interchangeable engines; both must keep producing the same shapes:

- **Live** (`src/engine/claude.ts` → `POST /api/ai` → `netlify/functions/_ai.mts`): the browser holds no key; the server calls Claude. Per turn: one `messages.create` with structured output (`TURN_SCHEMA`) returning `{reply, facts[], coverage}` — short, fits the sync budget. Final analysis: a **streaming** call (`REPORT_SCHEMA`) in `analysis-background.mts`. Prompts/schemas are imported unchanged from `src/engine/prompts.ts` — one interviewer, one analyst. Uses `claude-opus-4-8` by default. Requires `@anthropic-ai/sdk` ≥ 0.111 (`output_config`).
- **Simulated** (`src/engine/simulated.ts`): offline adaptive interviewer — regex **signal table** picks contextual follow-ups from the latest answer, else it probes the least-covered dimension; analysis is synthesized from collected facts. This is the no-API-key fallback and the guarantee the portal never dead-ends (live errors silently fall back to it mid-conversation).

**When you change the analysis output shape, update all three in lockstep:** `src/types.ts` (Report/Opportunity/etc.), `REPORT_SCHEMA` + report prompt in `src/engine/prompts.ts`, and the synthesis in `src/engine/simulated.ts`. Missing one produces silent `undefined`s in the dashboard. Both engines must return `AnalysisResult` including the discovered `departmentName`.

Cross-interview memory: `priorFindingsFor()` (prompts.ts) feeds severe pain points from completed interviews into every later interview's system prompt; the Graph derives cross-team patterns from shared pain categories. Note the engines differ on edges by design: the live engine extracts any team the conversation names (including not-yet-interviewed ones, drawn as dashed "mentioned" nodes); the offline engine can only link to *already discovered* team names, so its graph fills in as interviews accumulate.

## State & Persistence — SHARED, not browser-local

**Discovery is a multi-device pilot: data is organizational, not per-browser.** This is
the correction that unblocked the rollout — invitations, people, interviews and reports
live centrally, so a link opens on a department head's own phone and the interview
appears on the Innovation Team's dashboard.

- **Server:** `netlify/functions/` — `api.mts` (one sync router, `path = '/api/*'`),
  `analysis-background.mts` (the long report; exceeds the sync budget), `_store.mts`
  (Netlify Blobs; the storage seam), `_ai.mts` (Claude; the key seam).
- **Client:** `src/api.ts` is the only place that knows a backend exists. `src/store.tsx`
  keeps the same context API (`upsertPerson`, `upsertInvite`, `setInterview`…) but writes
  through to the server; mutations are async and a failed write surfaces rather than
  silently diverging. The dashboard polls every 15s while visible.
- **Only `settings` stays local** (a per-operator UI preference). No domain data in
  localStorage; the admin token is the sole other local value.
- **Swapping the datastore** (e.g. to Supabase, 13 § build reality) touches `_store.mts`
  and `src/api.ts` only — no domain type moves.

**Auth is real now.** `ADMIN_TOKEN` and `ANTHROPIC_API_KEY` are Netlify env vars.
The Innovation Team's token is verified **server-side** — the old bundled `ACCESS_CODE`
was decorative and is gone. Participants authenticate with their invitation token; the
Anthropic key never reaches a browser (which is why the client bundle dropped ~180 kB).
**Never** expose either as `VITE_*` — that compiles into the public bundle.

**Invariants that bit once — keep them:**
- *Two engines, one contract.* If Claude is unavailable the **server** falls back to
  `simulatedAnalysis` so a participant's twenty minutes never dead-end. Routing only the
  live path server-side broke this once.
- *The organization is discovered.* `analysis-background` back-fills the discovered team
  onto the person record — the roster learns from the conversation, not an org chart.
- An interview must never be left in `generating` with no explanation: on total failure it
  is stored as `analysis_failed` **with the transcript and facts preserved**.
- The SPA fallback (`/*` → `/index.html`) must never shadow `/api/*`.

Local development: `netlify dev` (port 8888) runs the functions and Blobs for real;
plain `npm run dev` serves the UI without an API. Copy `.env.example` → `.env` first.

## Commands

Stack: Vite 6 + React 18 + TypeScript 5.6 (strict, incl. `noUnusedLocals`) + Tailwind 3. No tests, no linter.

```bash
npm run dev        # port 5174 (root app owns 5173); runs `tokens` first
npm run tokens     # cyra-tokens.json → src/tokens.css (generated; never hand-edit)
npm run build      # esbuild — does NOT type-check; runs `tokens` first
npm run typecheck  # tsc --noEmit — the ONLY real type check
```

- `.claude/launch.json` at the **repo root** defines the `cyrix-discovery` preview config (`npm run dev --prefix cyrix-discovery`).
- Editing `tailwind.config.js` requires restarting the dev server (config is cached; new tokens fail in `@apply` until restart).
- If the browser-preview MCP pane wedges (blank screenshots while the DOM is verifiably fine), fall back to headless Chrome: `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --screenshot=<path> --window-size=1280,2400 http://localhost:5174/#innovation` (min width ~500px is silently enforced).

## Design governance — the CYRA Design System is the constitution

Discovery is the **reference implementation of the CYRA Design System** (v1, frozen). The system governs; this app conforms. `DESIGN_COMPLIANCE_REPORT.md` is the standing audit — read it before any UI change, and update it when you close or open a finding.

**Non-negotiables (violating any of these is a defect, not a preference):**
- **Tokens only.** `cyra-tokens.json` → `npm run tokens` → `src/tokens.css` (generated; never hand-edit) → `tailwind.config.js` extends **only** from those CSS variables; `src/tokens.ts` carries them into SVG paint. *A value that isn't a token is a review finding* (13). The colour, spacing, radius, shadow, weight and type scales are **replaced, not extended** — off-system values fail to compile. Keep it that way.
- **Palette is closed** (03): `ink` `paper` `red` + the neutral scale + the four ratified semantics. No new hues. **Red appears at most once per composition** (P6) — on any screen with the wordmark, the wordmark's period *is* that red.
- **Zero radius** (P7/14): constitutional. Changing it is an amendment, not a style tweak.
- **No shadows** (03): elevation is a neutral value step.
- **No pulse-line, no icon mark** (01; 00 caveat 2): the ECG "pulse trace" and the teal square were removed as the exact devices the brand retired. Do not reintroduce them. Identity is `CYRA.` + tracked `DISCOVERY` label, wordmark-only.
- **Provenance is invariant** (10/P4/06): machine-produced content *always* carries `DRAFT — UNVALIDATED` + a `ProvenanceLine`. AI output and validated knowledge are never visually interchangeable. Never ship an AI artefact without its state.
- **Motion vocabulary is closed** (08): 120/150/200ms, one easing, all from tokens. Indeterminate work = the hairline sweep (`working-rule`) + text naming the **real** step. Pulsing, bouncing dots, shimmer and spinners are prohibited — they were removed once already.
- **Voice** (11): sentence case for prose; uppercase only for the micro-label instrument; display headings are short finished sentences ending in a period; buttons are verbs; no emoji, no exclamation marks.

**Open decisions must be escalated, never guessed** (00): E4 (nav pattern) and E5 (ratifying Graph/Founder Brief/Opportunity Card as reference components) are unresolved; E6 (the expert review gate) is a product decision. E1 (typeface roles), E2 (semantic palette) and E3 (module identity) were **ratified 2026-07-17** and are recorded in `cyra-tokens.json`.

Amendments follow 00's rule: explicit written revision naming what changed and why — never silent drift.

## Design Language

Governed by the CYRA Design System (above) — **this section describes the conforming expression, not an independent system.**

Monochrome carries the structure; the single red carries identity. Canvas `neutral-050` (working screens are light-dominant); cards are `paper` + hairline `neutral-150`; ink `#0B0B0B`; secondary text `neutral-700`, micro-labels/metadata `neutral-500`. Semantics (ratified E2): `success` `#1E7A46`, `warning` `#B07A1E`, `error` `#B01E1E` — deliberately distinct from brand red so alarm ≠ identity.

Two voices (ratified E1): **Schibsted Grotesk** = display (headings, hero numbers, the wordmark); **IBM Plex Sans** = body **and** the tracked micro-label instrument (`.eyebrow`, 12px/0.18em/uppercase/medium/neutral-500). The monospace voice is retired. Three weights only: `font-regular` / `font-medium` / `font-heavy`. All quantitative display uses tabular lining figures (set globally on `body`).

Shared primitives live in `src/components/ui.tsx`: `Wordmark`, `ModuleLabel`, `InitiativeLabel`, `Card`, `Tag` (text badge, never a coloured pill), `ProvenanceBadge`, `ProvenanceLine`, `ProgressRule` (determinate hairline), `WorkingRule` (indeterminate sweep + staged text), `Stat`, `SectionHeading`. Utilities `.card` / `.eyebrow` / `.btn-primary` / `.btn-secondary` / `.btn-tertiary` / `.btn-destructive` / `.input` are in `src/index.css`.

- **Participant side** (`Portal`): minimal chrome, no internal mechanics, warm consultant tone, ≥44px targets. **Internal side** may be denser. Same frame, same tokens — rooms in one building (P10).
- **Gotcha:** editing `tailwind.config.js` requires restarting the dev server (the running process caches the config) — a new token silently fails to compile until restart.

## Voice

`Portal.tsx` uses the Web Speech API directly (`webkitSpeechRecognition`, minimally typed as `any` via `speechCtor()`; TTS via `speechSynthesis` for consultant messages in voice mode). Transcription fills the same textarea as typing — the participant reviews before sending, and both modes feed one conversation thread. Voice is hidden when the browser lacks support; it is Chrome-only in practice.

## Clinical/Business Guardrails

Interview prompts must never promise outcomes or recommend AI *during* the conversation; the confirmation step ("What I understood") exists for data quality and trust — don't remove it; participant-facing copy must never leak internal information (other departments' findings, scores, the existence of the dashboard).
