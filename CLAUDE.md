# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Scope:** this file covers `cyrix-discovery/` only. The repo root holds a *separate, unrelated* app (Continuum, a rehab-hospital demo) with its own CLAUDE.md, design language and dev server (port 5173). Never mix code, data or design tokens between the two.

## What This Is

**Cyrix Discovery** — an AI-powered Organizational Discovery Platform for Cyrix Healthcare (India's largest biomedical equipment service org, ~1200 engineers, 14 departments). An AI interviewer holds a ~20-minute consultant-grade conversation with each department head, builds a knowledge model across **10 discovery dimensions** (`DIMENSIONS` in `src/types.ts` — value, flow, time, knowledge, knowledgeLoss, decisions, delays, manual, aiOpportunity, impact), then derives a 12-section discovery report, a classified AI-opportunity portfolio, a founder brief, and edges for a company-wide knowledge graph.

Product stance (from the deployment brief, holds for all changes): **not a survey, not a chatbot**. Understanding first — AI opportunities must emerge from interview evidence, never from pitching. Trust, low friction and insight quality beat feature count. Refine; don't redesign.

## Two Experiences, Split by URL Hash

Routing is parsed **once at module load** in `src/App.tsx` (`parseRoute()`); there is no router library.

- **`#invite/<token>`** → **Discovery Conversation Portal** (`src/screens/Portal.tsx`) — the only surface participants ever see. The token identifies the *invitation*, never the department (**the form always asks the department; never derive it from the URL**). Tokens are self-validating (11 base36 chars + checksum); ALL validation lives in `src/invites.ts` (`lookupDecision`) — the single seam a future backend replaces. Flow: Welcome → Basic context → Conversation (voice or text, switchable mid-stream) → "What I understood" confirmation → Submit → Thank you. **No navigation, no settings, no reports, no hint that anything else exists.** Participants never see the generated report. The bare URL shows an invitation-required notice.
- **`#innovation`, `#innovation/{dashboard,graph,invites}`** → **Innovation Dashboard** — everything else (department grid, Invitation Manager, dashboard, knowledge graph, reports, settings). Gated by a front-end access code (`ACCESS_CODE` in `App.tsx`, flag persisted in localStorage under `cyrix-innovation-access`). This is demo-grade gating — move behind real auth when a backend exists.
- **Deployment:** static Netlify site — `netlify.toml` + step-by-step `DEPLOY_NETLIFY.md`. No env vars; never put an API key in a `VITE_*` variable (it would be public).
- Internally, clicking a not-complete department renders the *same* `Portal` component with `internal` + `presetDeptId` props (nav stays visible, completion shows the report). There is deliberately **one** conversation implementation — do not fork a second interview UI.

## Two Engines, One Contract

Every interview runs on one of two interchangeable engines; both must keep producing the same shapes:

- **Live** (`src/engine/claude.ts`): browser → Claude API directly (`dangerouslyAllowBrowser`; key from Settings, localStorage only). Per turn: one `messages.create` call with structured output (`output_config.format` json_schema, `TURN_SCHEMA`) returning `{reply, facts[], coverage}`. Final analysis: one **streaming** call (`REPORT_SCHEMA`) returning profile + report + opportunities + graph edges. Uses `claude-opus-4-8` by default (picker in Settings). Requires `@anthropic-ai/sdk` ≥ 0.111 — older versions don't type `output_config`.
- **Simulated** (`src/engine/simulated.ts`): offline adaptive interviewer — regex **signal table** picks contextual follow-ups from the latest answer, else it probes the least-covered dimension; analysis is synthesized from collected facts. This is the no-API-key fallback and the guarantee the portal never dead-ends (live errors silently fall back to it mid-conversation).

**When you change the analysis output shape, update all four in lockstep:** `src/types.ts` (Report/Opportunity/etc.), `REPORT_SCHEMA` + report prompt in `src/engine/prompts.ts`, the synthesis in `src/engine/simulated.ts`, and the seeded data in `src/data/seed.ts`. Missing one produces silent `undefined`s in the dashboard.

Cross-interview memory: `priorFindingsFor()` (prompts.ts) feeds severe pain points from completed interviews into every later interview's system prompt; the Graph screen derives cross-department patterns from shared pain categories.

## State & Persistence

No backend. `src/store.tsx` is a React context persisted to localStorage under `cyrix-discovery-v3` (bump the key when the persisted shape changes — old data is simply abandoned). **The platform starts clean — there is no seed/demo data and none may be reintroduced** (rollout rule: every insight is earned from real interviews). Until the first interview completes, the Dashboard renders `VisionDashboard` (Dashboard.tsx) — an executive command-center vision state with honest zeros — and swaps to the real intelligence view afterwards. **One interview per department**; starting a new portal conversation for a department (or any reset) archives the old interview to `cyrix-discovery-archive` (best-effort, never silently destroyed).

## Commands

Stack: Vite 6 + React 18 + TypeScript 5.6 (strict, incl. `noUnusedLocals`) + Tailwind 3. No tests, no linter.

```bash
npm run dev        # port 5174 (root app owns 5173)
npm run build      # esbuild — does NOT type-check
npm run typecheck  # tsc --noEmit — the ONLY real type check
```

- `.claude/launch.json` at the **repo root** defines the `cyrix-discovery` preview config (`npm run dev --prefix cyrix-discovery`).
- Editing `tailwind.config.js` requires restarting the dev server (config is cached; new tokens fail in `@apply` until restart).
- If the browser-preview MCP pane wedges (blank screenshots while the DOM is verifiably fine), fall back to headless Chrome: `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --screenshot=<path> --window-size=1280,2400 http://localhost:5174/#innovation` (min width ~500px is silently enforced).

## Design Language

Executive-calm, instrument-heritage: canvas `porcelain`, ink `carbon`, primary `petrol` teal, live accent `pulse` teal, `amber` = attention, `signal` coral-red **reserved for risk/critical only** (never a casual accent). Type: Schibsted Grotesk (display) / IBM Plex Sans (body) / IBM Plex Mono (eyebrows, tags, data) via Google Fonts `<link>` in `index.html`. Tokens live in `tailwind.config.js`; shared primitives in `src/components/ui.tsx` (`Card`, `Tag`, `Meter`, `.input`/`.btn-*` utilities in `index.css`).

- **Signature element:** the `PulseTrace` (ui.tsx) — an ECG line with one beat per discovery dimension whose amplitude grows with coverage. It appears on department cards, the conversation header and reports. SVG strokes hardcode hexes (`#14b8a3`, `#cfd9d6`) — keep in sync with `pulse-500`/`porcelain-300` if the palette changes; same for the favicon/`theme-color` in `index.html`.
- Dashboard categorical trio (opportunity horizons) is CVD-validated: `#12907f` / `#c76e0a` / `#8464e0` — don't swap casually.
- Participant-side rule: minimal chrome, no internal mechanics (no fact counts, no dimension meters), warm consultant tone. Internal side may be dense.

## Voice

`Portal.tsx` uses the Web Speech API directly (`webkitSpeechRecognition`, minimally typed as `any` via `speechCtor()`; TTS via `speechSynthesis` for consultant messages in voice mode). Transcription fills the same textarea as typing — the participant reviews before sending, and both modes feed one conversation thread. Voice is hidden when the browser lacks support; it is Chrome-only in practice.

## Clinical/Business Guardrails

Interview prompts must never promise outcomes or recommend AI *during* the conversation; the confirmation step ("What I understood") exists for data quality and trust — don't remove it; participant-facing copy must never leak internal information (other departments' findings, scores, the existence of the dashboard).
