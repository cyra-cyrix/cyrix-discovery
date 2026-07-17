# Cyrix Discovery — AI-Powered Organizational Discovery Platform

An AI interviewer that spends ~20 minutes with each department head of Cyrix Healthcare,
understands how the department actually works, and automatically derives AI / automation
opportunities, a discovery report, and a company-wide knowledge graph.

**Not a survey. Not a chatbot.** The interviewer adapts every question to the previous
answer — probing delays, workarounds, spreadsheets, WhatsApp groups and "only-in-my-head"
knowledge the way an experienced business consultant would. Understanding comes first;
AI recommendations emerge from the evidence afterwards.

## Run it

```bash
npm install
npm run dev        # http://localhost:5174
npm run build      # static production build to dist/
npm run typecheck  # tsc --noEmit (the only real type check)
```

## Two experiences (first internal deployment)

| Who | URL | What they see |
|---|---|---|
| **Participants** (department heads, team leaders) | a unique invitation link `…/#invite/<token>`, issued **per person** from the internal **People** page | The **Discovery Conversation Portal** only: Welcome → basic context → AI conversation (voice or text, switchable mid-stream) → "What I understood" confirmation → Submit → Thank you. No navigation, no reports, no hint the rest exists. The bare URL without a token shows a polite "by invitation" notice. |
| **Innovation Team / Founders** | `…/#innovation` | **Dashboard** (the landing page — founder briefs, priority matrix, portfolio, pain, risks, search), **People** (roster + invitations), **Graph** (the emergent knowledge graph), full reports, settings. Gated by an access code (`ACCESS_CODE` in `src/App.tsx` — change it before deploying) — front-end-only gating; move behind real auth with the first backend. |

### People-first: the organization is discovered, not declared

**PERSON is the primary entity.** There is no predefined department list. Each person record holds name, designation, email, phone, state, optional reporting manager, optional department, and interview status; invitations are issued to that person. The **department is discovered by the interview** — participants may leave it blank, and the analysis names the team in the organization's own vocabulary, then back-fills it onto the person record. **Relationships between teams emerge the same way**: the knowledge graph starts empty and draws a node only when a conversation reveals a team, and an edge only when a conversation evidences a dependency (`src/org.ts` derives all of this from completed interviews).

**Invitation tokens** are self-validating (11 random base36 chars + checksum) so participant devices can reject malformed links without a backend; all validation logic is isolated in `src/invites.ts` — the single seam a future backend replaces (`lookupDecision` → API call). Until then, disable/completed state is enforced on the device holding the invite records. Deployment: see **DEPLOY_NETLIFY.md** (config in `netlify.toml`).

Participants never see generated reports. Every completed interview also produces a **Founder Brief** — the 60-second read that leads the dashboard. Starting a new conversation for a department archives the previous interview (localStorage `cyrix-discovery-archive`) rather than destroying it.

**The platform starts clean.** There is no demo data anywhere: until the first real interview completes, the Innovation Dashboard is an executive command center that states the mission, the honest zeros (0 of 14 interviewed, 0% knowledge coverage, understanding: *Beginning*), the capabilities that "will be generated automatically", the 11-step discovery journey, the management deliverables, and why it matters. Every insight is earned from real interviews; the dashboard progressively becomes a living intelligence system as they complete.

**Voice** uses the browser's Web Speech API (Chrome): speech is transcribed into the reply box for review before sending, and the consultant's questions are read aloud; participants can switch between speaking and typing at any time.

## Two modes

| Mode | How | What happens |
|---|---|---|
| **Live AI** | Settings (gear icon) → paste an Anthropic API key | Interviews run on Claude (`claude-opus-4-8` by default) with structured fact extraction per turn, and a full model-generated discovery analysis at the end. The key is stored only in the browser's localStorage; calls go directly from the browser to the Claude API. |
| **Demo** | No key | A built-in adaptive interviewer (signal-driven follow-ups + coverage targeting) runs the same flow offline, so the platform always demos. |

Settings → "Clear all interview data" archives everything and returns the platform to its clean start.

## What each interview produces

1. Executive summary · 2. Capability map · 3. Current workflow · 4. Pain-point analysis
(classified: Waiting, Searching, Knowledge waste, …) · 5. Knowledge flow · 6. Decision flow ·
7. AI opportunity map (each opportunity: problem, current cost, people, solution, business
value, complexity, confidence, impact/effort) · 8–10. Quick wins / medium / strategic
horizons · 11. Estimated business impact · 12. Questions that remain unanswered — plus
graph edges that update the company knowledge graph, and pain-point memory that is fed
into every subsequent interview (cross-department pattern detection).

## Architecture

Front-end only (Vite + React 18 + TS + Tailwind 3), state persisted in localStorage.

- `src/engine/prompts.ts` — the consultant system prompt, per-turn JSON schema, report schema
- `src/engine/claude.ts` — Claude API calls (structured outputs; streaming for the long report)
- `src/engine/simulated.ts` — offline adaptive interviewer + offline analysis synthesis
- `src/org.ts` — the emergent organization: departments, relationships and person status all derived from completed interviews
- `src/invites.ts` — invitation tokens (the backend seam)
- `src/store.tsx` — localStorage-backed store: `people` · `interviews` (keyed by person) · `invites` (starts empty; replaced interviews are archived)
- `src/screens/` — Portal (participant), Dashboard, People, Graph, Report, Settings
- The **pulse trace** (ECG line, one beat per discovery dimension) is the product's signature:
  amplitude grows as the ten discovery objectives are understood.
