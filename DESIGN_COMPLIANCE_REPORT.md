# Design Compliance Report — CYRA Discovery

**Reviewed:** Discovery application (`cyrix-discovery/`), commit state of 2026-07-17
**Against:** CYRA Design System v1 (files 00–14), frozen, governing
**Method:** every screen, component, token and interaction compared clause-by-clause. Findings cite the design-system clause and the code location. Per 02 § Review procedure, "I don't like it" is not a finding; every item below names a rule.
**Verdict at review (2026-07-17):** **Non-compliant.** Discovery was a well-built application of a *different* design system. It shared zero color tokens, zero radius compliance, and no provenance vocabulary with CYRA. Nothing here is a criticism of the build quality; the gap is that Discovery was designed before the constitution existed.

> **REMEDIATION STATUS — updated 2026-07-17.** Escalations E1, E2, E3 ratified by the platform owner (§4). **Phases 1–3 implemented and verified: all five Critical findings and H1/H2/H6/M4/M5/M6/M10/L1–L5 are closed.** Remaining: H3, H4, H5(part), M1–M3, M7–M9 — scheduled in Phases 4–8. See §5.

The good news: Discovery's *architecture* (people-first discovery, evidence-before-opportunity, honest empty states, no fake data) is already philosophically aligned with CYRA's deepest rules — P1, P4, P8 and "minimalism without emptiness". The divergence is almost entirely in the visual and vocabulary layers, which are the layers the constitution governs most strictly and which are the cheapest to correct.

---

## 1 · Scope and evidence discipline

The Evidence Register (00) forbids backfilling **Open** items by guessing: *"Future teams must not backfill Open items by guessing; they escalate."* This report therefore separates:

- **Findings** — divergences from Confirmed, Inferred-binding, or Invariant rules. These are defects; they are fixed.
- **Escalations** — points where the design system itself declares no decision exists. These are **not** defects, and I will not invent answers. They require the platform owner's ratification (§ 4).

---

## 2 · Findings

### CRITICAL — violates an Invariant or the platform's core law

**C1 · The colour system is entirely non-compliant.**
*Clause:* 03 core palette (**Confirmed**: `ink #0B0B0B`, `paper #FFFFFF`, `cyra-red #E11B22`); 01 Invariant "monochrome + single red"; P6 one accent.
*Code:* `tailwind.config.js` — ships `petrol` (#0a3f3a…#15806f), `pulse` (#14b8a3), `porcelain`, `carbon` (#131f1d), `amber`, `signal` (#d84a2b), `slate`.
*Gap:* **Not one CYRA token is present.** The platform's brand red does not appear anywhere in the application. The identity accent is currently teal. Every surface, every button, every label colour is off-constitution.

**C2 · The signature element is the exact device the brand explicitly dropped.**
*Clause:* 01 (**Confirmed**, S4): *"CYRA drops the literal pulse-line and circular emblem of earlier explorations. Wordmark-only."* 00 caveat 2: the pilot deck's *"circular pulse logo"* is a **superseded presentation style** — *"no product UI inherits from it."*
*Code:* `components/ui.tsx` → `PulseTrace` (an ECG waveform, rendered on department cards, the conversation header, and every report); `Wordmark` (pulse line inside a rounded teal square); `index.html` favicon (same mark); `tailwind.config.js` → a colour token literally named `pulse`.
*Gap:* Discovery's most prominent design decision is the one artefact the constitution names as abandoned. It is also decorative progress (P2: nothing purely decorative ships).

**C3 · Discovery presents itself as a separate product, not a room in the building.**
*Clause:* 01 (**Confirmed**): wordmark-only; *"No separate icon mark is created for any module."* 02 P10 rooms-in-one-building; 05 the frame carries *"the CYRA wordmark + tracked module label"*.
*Code:* `components/ui.tsx` → `Wordmark` renders "Cyrix **Discovery**" with a bespoke icon mark; there is no CYRA wordmark and no module label anywhere in the application.
*Gap:* A user crossing from CYRA into Discovery today experiences a launch screen, not a corridor. Required lockup: `CYRA.` (red terminal dot) + tracked uppercase `DISCOVERY`.

**C4 · Zero-radius is violated system-wide.**
*Clause:* P7 severity-as-trust (**Inferred, binding**); 14 `radius.none` — *"Zero radius is a platform principle. Changing this is a constitutional amendment, not a style tweak."*
*Code:* 40 `rounded-*` utilities across `src/` — `rounded-xl` cards, `rounded-2xl` chat bubbles, `rounded-lg` buttons and inputs, `rounded-full` dots/pills/avatars, `rx="7"` on the favicon.
*Gap:* The application reads as consumer software. Not one surface in Discovery is currently square.

**C5 · AI output is presented as validated knowledge, with no epistemic status.**
*Clause:* 10 provenance invariant — machine-produced content is **always** labelled (`DRAFT — UNVALIDATED`); *"AI output and validated knowledge are never visually interchangeable."* P4 evidence over assertion. 06: *"knowledge is never shown without its state"* — named a platform invariant.
*Code:* Founder briefs, discovery reports, opportunity cards and every dashboard number are model-generated and carry **no** status badge and **no** provenance line (captured-by / validated-by / date / source stream). Grep for the platform's epistemic vocabulary returns nothing in the UI.
*Gap:* This is the constitution's core law — *nothing becomes knowledge until an expert approves it* — and Discovery currently asserts machine output as fact on the founders' primary decision surface. **This is the most serious finding in the report**, and the cheapest partial remedy (labelling) requires no new features.

### HIGH — violates a binding rule with system-wide reach

**H1 · No token pipeline; raw values throughout.**
*Clause:* 13 — tokens compile to CSS custom properties; Tailwind extends **only** from those variables; *"a value that isn't a token is a review finding."*
*Code:* raw hex in `tailwind.config.js`; 36 raw hex literals across `Graph.tsx`, `Dashboard.tsx`, `Portal.tsx`, `ui.tsx`, `index.css`; hard-coded `theme-color` and favicon hexes in `index.html`.

**H2 · Prohibited motion: typing theatrics and a pulsing indicator.**
*Clause:* 08 — *"pulsing orbs, shimmer, typing theatrics, particle fields — prohibited"*; indeterminate state is *"a thin animated hairline, not a spinner"*; motion vocabulary is closed (120/150/200ms, one easing).
*Code:* `Portal.tsx:679` — three `animate-bounce` dots as "the consultant is thinking"; `Portal.tsx:642` — `animate-ping` on the live microphone. Durations are untokenized.
*Gap:* The bouncing dots are literally the "AI is thinking" theatre the motion doctrine exists to forbid.

**H3 · The conversation is a chat stream, not a document.**
*Clause:* 07 § Conversation flows — *"The user's prior answers remain visible — the conversation is a document being built together, not a chat stream that scrolls away."* 10 — *"no chat bubbles styled as a personality."*
*Code:* `Portal.tsx` → `Conversation` renders `rounded-2xl` message bubbles (petrol fill for the participant) inside a fixed-height scrolling pane.

**H4 · Charts are chromatic and titled as topics.**
*Clause:* 09 — default palette is the **neutral value ramp**; `cyra-red` marks *one* series; *"A chart with three bright colors has not decided what it means."* Rule 1: the title states the **finding**, not the topic. Rule 2: legends are a last resort.
*Code:* `Dashboard.tsx` → `HORIZON_COLOR` categorical trio (#12907f / #c76e0a / #8464e0) + legend; titles "Priority matrix — impact vs effort", "Opportunity portfolio".
*Note:* that trio was chosen under a *different* (colour-blindness-validated) rulebook. CYRA's monochrome-first rule supersedes it — and satisfies the same accessibility goal by encoding with value and direct labels instead of hue (12 § 2).

**H5 · The micro-label instrument is implemented in the wrong voice.**
*Clause:* 04 § 2 — the label is *"small size, wide letter-spacing (~0.15–0.25em), medium weight, neutral colour"* in the type system's own voices; 14 `tracking.label = 0.18em`. 04 § 1: a **two**-voice system.
*Code:* `index.css:27` — `.eyebrow` uses **IBM Plex Mono** at `tracking-[0.14em]`; three families ship (Schibsted Grotesk / Plex Sans / Plex Mono).
*Gap:* Monospace is not the label instrument; tracking is under-spec. (Typeface *selection* is Open — see E1.)

**H6 · No tabular numerals on a scoreboard-driven product.**
*Clause:* 04 § Numbers — *"All quantitative display uses tabular lining numerals"*; 14 `numerals: tabular-lining`; 09 § scoreboard.
*Code:* zero occurrences of `font-variant-numeric` / `tabular` anywhere.

### MEDIUM — visible divergence, contained scope

| # | Finding | Clause | Code |
|---|---|---|---|
| M1 | Buttons are sentence-case prose ("Add a person", "Save", "Send", "Re-interview"), not tracked-uppercase verbs (`ADD PERSON`, `SAVE`) | 06 Buttons; 11 rule 3 | all screens |
| M2 | The period gesture is absent from most display headings ("Who we're listening to", "How Cyrix actually connects", "Discovery dashboard", "What I understood") | 11 rule 2; 04 § 3; 01 § period | People, Graph, Dashboard, Portal |
| M3 | Display copy exceeds 6 words ("Help us understand how your work really happens." = 8) | 11 rule 4 | Portal welcome |
| M4 | Focus ring is 2px **teal**; spec is 2px `ink`, offset 2px | 07 Keyboard; 12 § 3 | `index.css` |
| M5 | No module label / breadcrumb band; three-band screen anatomy not explicit | 05 § Screen anatomy | App shell |
| M6 | Long AI operations show one static line ("Recording your discovery…"), not staged text naming the actual step | 07 § Latency; 08; 10 § Waiting | Portal `generating` |
| M7 | Status rendered as coloured pill backgrounds | 06 Tables — *"never a coloured pill background"* | `ui.tsx` → `Tag` |
| M8 | Card hover uses lift + shadow + translate | 07 Hover — *"No scale transforms, no lift shadows"* | People, Dashboard |
| M9 | Glyph iconography in content (`⚠`, `✓`) | 11 rule 5 | Report, People |
| M10 | Shadows used for elevation (`shadow-card`, `shadow-rail`) | 03 hierarchy rule; 14 `shadow.none` | `tailwind.config.js` |

### LOW — cosmetic or hygiene

| # | Finding | Clause |
|---|---|---|
| L1 | Spacing off the 8px grid in places (`mt-1.5`=6px, `gap-2.5`=10px, `py-3.5`=14px) | 05 § Grid; 14 spacing |
| L2 | Content max-width 1152px (`max-w-6xl`); token `wide` = 1440px | 14 breakpoints |
| L3 | Dialog scrim `carbon/40`; spec `ink` at 60% | 06 Dialogs |
| L4 | z-index literals (`z-40`, `z-50`) not from the `zIndex` token scale | 14 zIndex |
| L5 | `font-feature-settings: 'ss01'` — untraceable to any token | 13 § tokens only |

---

## 3 · What already complies

Worth recording, so the roadmap doesn't regress it:

- **P1/P4 architecture** — evidence-before-opportunity; opportunities emerge from interviews, never from pitching.
- **Minimalism without emptiness** (01 tension 3) — the vision dashboard names what belongs in every empty state and how it arrives; 06 § Empty states is already satisfied in spirit.
- **No fake data** — the platform earns every insight; honest zeros. This is a direct expression of P4 and was hard-won.
- **`prefers-reduced-motion`** honored (`index.css`), per 08.
- **Semantic landmarks, ≥44px targets, keyboard-operable forms** — 12 § 3/5 substantially met.
- **The period gesture** appears correctly on the two thesis headings and "Thank you." — the instinct is right, it is just not applied systematically.

---

## 4 · Escalations — decisions the design system says only you can make

Per 00, these are **Open**. I will not guess them. Each carries the system's own Future recommendation and my assessment; none is binding until you ratify.

| # | Open decision | DS status | Recommendation |
|---|---|---|---|
| **E1** | **Typeface selection** (04, 14 `font.family` = `open`) | Open; blocks Phase 1 | Discovery ships Schibsted Grotesk + IBM Plex Sans + Plex Mono. Recommend: keep a heavy geometric grotesque for display, adopt a humanist sans with Devanagari/Malayalam coverage + tabular figures for body, and **retire the monospace voice** (the label is not a mono instrument). Needs ratification for the whole platform, not just Discovery. |
| **E2** | **Semantic palette** (03 — Open, Future recommendation only) | Open; blocks status badges | Ratify the system's own recommendation: success `#1E7A46`, warning `#B07A1E`, error `#B01E1E`, info `neutral-700`. Discovery needs these for interview status and pain severity. |
| **E3** | **Module Identity Rule** (02 — Open, Future recommendation) | Open; blocks Phase 2 | Ratify name-only: `CYRA.` + tracked `DISCOVERY`, no per-module accent, no per-module icon. Strictest reading of the wordmark-only + single-accent decisions; cheapest to hold for a decade. |
| **E4** | **Navigation pattern** — left rail vs top tabs (06 — *"Decision required before the second module's build"*) | Open | Discovery uses top tabs today. Recommend ratifying top tabs (no migration cost) or deferring until Revive's build. |
| **E5** | **Knowledge Graph / Founder Brief / AI Opportunity Card** (06 — *"listed as Open deliberately"*) | Open | **Discovery has already built all three.** They should be ratified *as* the reference implementations, re-derived from monochrome-first + provenance-always + trust-as-weight + calm motion. This is the point at which Discovery starts *feeding* the design system rather than only consuming it. |
| **E6** | **The human review gate** — 10/P4: *nothing becomes knowledge until an expert approves it* | Not Open — but Discovery has no approval step | Adding a review workflow is a **feature/architecture change**, which you have ruled out of scope. Interim remedy inside scope: label all machine output `DRAFT — UNVALIDATED` (honest, no new feature). Flagging that full C5 compliance eventually requires the gate. |

---

## 5 · Implementation roadmap

Sequenced so each phase is independently shippable and verifiable, foundation-first — later phases are cheap only if the earlier ones land first. Estimates are engineering effort, not calendar.

| Phase | Scope | Closes | Effort | Depends on |
|---|---|---|---|---|
| ~~0 · Ratification~~ | E1, E2, E3 ratified 2026-07-17; recorded in `cyra-tokens.json`. E4 (nav) defaults to top tabs — no migration. E5 open. | — | — | ✅ **Done** |
| ✅ **1 · Foundation** | `14_Design_Tokens.json` → generated CSS custom properties → Tailwind extends only from vars. Delete the petrol/pulse/porcelain/carbon palette. Zero radius everywhere. Remove shadows (elevation → neutral value steps). Ink focus ring. Tabular numerals. 8px grid. | C1, C4, H1, H6, M4, M10, L1–L5 | ~1 day | E1, E2 |
| ✅ **2 · Identity** | `CYRA.` wordmark + red terminal dot; tracked `DISCOVERY` module label in the frame. Delete `PulseTrace` and the pulse icon mark; new favicon/theme-color. Retire the `pulse` token. Three-band screen anatomy. | C2, C3, M5 | ~0.5 day | E3, Phase 1 |
| ✅ **3 · Provenance & AI honesty** | `DRAFT — UNVALIDATED` badges on every machine-produced artefact; provenance line (captured-by / date / source) on reports, briefs, opportunities. Replace bouncing dots and `animate-ping` with the hairline sweep. Staged status text naming real steps. Tokenized motion. | **C5**, H2, M6 | ~1 day | Phase 1 |
| **4 · Components** | `Cyra*` primitives per 13 (`CyraButton`, `CyraField`, `CyraBadge`, `CyraCard`, `CyraTable`), typed variants, no className overrides. Status as text badges, not pills. Hover = value step. Dialog scrim. | M7, M8, L3 | ~1 day | Phase 1 |
| **5 · Conversation as document** | Rebuild the interview surface as an accumulating document (answers persist as structure, not bubbles); confirmed structures shown back before save. | H3 | ~0.5 day | Phase 4 |
| **6 · Data visualization** | Priority matrix and portfolio → neutral value ramp, one red mark, direct labels, legend removed, finding-titles. | H4 | ~0.5 day | Phase 1 |
| **7 · Voice** | Uppercase verb buttons; period gesture on all display headings; ≤6-word display copy; strip glyphs; copy into `content/` constants per 13. | M1, M2, M3, M9 | ~0.5 day | Phase 4 |
| **8 · Ship gate** | Keyboard-only pass, screen-reader pass, automated contrast audit (12 — *"no severity negotiation"*). Typecheck + build + full E2E re-verification. | 12 | ~0.5 day | all |

**Total: ~5.5 engineering days**, of which Phases 1–3 (~2.5 days) close every Critical finding.

**Recommended first cut:** Phases 1 → 2 → 3. That converts Discovery from "a different design system" into "CYRA, with rough edges" — the remaining phases are refinement, and each is safely deferrable.

---

## 6 · Assessment

Discovery is the right module to make the reference implementation: it is the most complete, it already embodies the platform's evidence doctrine, and it has built three of the components the design system left Open (E5) — so ratifying it forces those decisions to be made well, once, with a working artefact in hand.

The work is genuinely mechanical. It is not a redesign, and no feature or architectural change is proposed anywhere in this roadmap. The single exception worth your explicit attention is **C5**: labelling machine output as unvalidated is inside scope and will land in Phase 3, but *full* compliance with the platform's core law eventually requires the expert review gate that Discovery does not have (E6). That is a product decision, not a design one.


---

## 7 · Remediation log — Phases 1–3 (2026-07-17)

**Phase 1 · Foundation** — closed C1, C4, H1, H6, M4, M10, L1–L5.
`cyra-tokens.json` is vendored as the single source; `scripts/build-tokens.mjs` compiles it to 61 CSS custom properties in `src/tokens.css` (wired to `predev`/`prebuild`). Tailwind's colour, spacing, radius, shadow, weight and type scales are **replaced, not extended** — an off-system value now fails to compile rather than relying on reviewer vigilance. `src/tokens.ts` carries the same tokens to SVG paint attributes. The petrol/pulse/porcelain/carbon palette is deleted.
*Verified in-browser:* every computed colour on the dashboard resolves to a CYRA token (ink, neutral-900/700/500/300/150/050, paper, warning, error); **zero** non-zero border-radii; **zero** shadows; `font-variant-numeric: lining-nums tabular-nums` active.

**Phase 2 · Identity** — closed C2, C3, M5.
`PulseTrace` deleted (01; 00 caveat 2) and replaced by `ProgressRule`, a determinate hairline that fills (06/08). The teal pulse-in-a-rounded-square icon mark is gone; the wordmark is now `CYRA.` with the red terminal dot, paired with a tracked `DISCOVERY` module label in the fixed frame (E3). `A CYRIX INITIATIVE` attaches to threshold screens only. Favicon is a crop of the wordmark (C + red period) on ink — not a new icon mark. Product naming corrected to CYRA Discovery.
*Verified in-browser:* exactly **one** red element on the screen — the wordmark's period (P6); zero raw hex in SVG.

**Phase 3 · Provenance & AI honesty** — closed **C5**, H2, M6.
`ProvenanceBadge` (`DRAFT — UNVALIDATED`) now marks every machine-produced artefact: discovery reports, founder briefs (both on the report and on the founders' dashboard), and each AI opportunity card. `ProvenanceLine` renders captured-by / date / source-stream / validation state — Discovery extends the platform's stream vocabulary with `INTERVIEW` (permitted by 02 P10). The dashboard states plainly that everything below is drafted and unvalidated. The three `animate-bounce` "thinking" dots and the `animate-ping` microphone are deleted; indeterminate work is now the hairline sweep (`working-rule`, 1.2s from the token) with staged text naming the **actual** step, driven by real stream events in `liveAnalysis` (`Reading the conversation` → `Writing the discovery report` → `Structuring the findings`).
*Verified in-browser:* a full participant journey (invite → context → conversation → summary → submit → thank-you) runs green; the working indicator and its stage text appear during the pause; the report header reads `DISCOVERY REPORT · DRAFT — UNVALIDATED` above `CAPTURED FROM RAVI MENON · 17 JUL 2026 · SOURCE INTERVIEW · NOT YET VALIDATED`.

**Caveat carried forward:** labelling is honest, but it is not the review gate. Full compliance with the platform's core law — *nothing becomes knowledge until an expert approves it* — still requires the approval workflow described in **E6**, which is a product decision outside this programme's scope.
