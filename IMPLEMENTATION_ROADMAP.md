# Implementation Roadmap — CYRA Discovery Intelligence Layer

**Date:** 2026-07-17 · Phase 2 deliverable. Companion: `ARCHITECTURAL_REVIEW.md` (Phase 1).
**Governing rules honored throughout:** never rewrite the application · never replace working functionality · extend incrementally · the interview flow is never broken · every milestone is independently testable, committed, verified, deployed before the next · nothing PARKED by the blueprint is invented here.

**Strategy in one sentence:** build the intelligence pipeline **beside** the existing per-interview analysis (which keeps working untouched), stage by stage in the blueprint's own dependency order — evidence → findings → problems → prescriptions → assembly — and only cut each screen over to the new base when the stage beneath it is real, tested, and reviewer-gated.

---

## Milestone 0 — Decisions and foundations *(blocking; no code)*

Inputs only you can supply. Nothing in M1+ starts cleanly without them.

1. **The two still-missing documents.** The Interview Engine Runtime spec has now been supplied (and is reflected in this roadmap as Milestone 2). Still needed: the **Constitution** (the law both available docs bind to — conflict rule is Constitution > Methodology > Runtime, so building without it risks misreading both) and the **Methodology** (`CYRA_INTERVIEW_ENGINE_SPEC.md`). Supply them, or declare in writing that the two available documents + their constitutional citations govern V1.
2. **Deployment target.** Confirm Netlify (the live, working pipeline) or explain the Lovable reference. Assumed Netlify.
3. **Datastore.** The object model (evidence ⟷ findings ⟷ problems ⟷ recommendations, review states, versioned config) needs relational/indexed behavior.
   - *Option A — activate the documented Supabase seam* (touches only `_store.mts` + `src/api.ts` per the architecture's own design; migrations, real queries, transactional review-state updates). Recommended if the pilot is to scale past ~10 interviews of intelligence work.
   - *Option B — structured Blobs layout* (`evidence/`, `findings/`, `problems/`, … + index blobs). Zero new vendor, but hand-rolled indexes, no transactions (Blobs writes are already known non-atomic — BL item 10), and every J-invariant test gets harder. Viable for the pilot, a known cliff after it.
   - Decision needed; A is recommended and its cost is one milestone, isolated by design.
4. **Reviewer identity.** F5/J2 require an attributable "who confirmed". Minimum viable: named operator profiles behind the existing admin token (name recorded on every confirmation — audit-grade *within* a trusted team). Real multi-user auth is a later, separate decision. Confirm the minimum is acceptable for V1.
5. **Customer strategy input (§4.3).** The strategic-importance dimension needs Cyrix's declared objectives as configuration; until supplied, tiers will carry UNASSESSED on that dimension — per spec, never guessed.
6. **PARKED stays parked** (§4.2 dominance table beyond the spec's example rules, §5.5 thresholds, F5 sampling policy, financial sizing, benchmarking). Implemented as explicit, versioned configuration stubs labeled provisional — visible, changeable, never silently invented.

> **M0 CLOSED (owner decisions, 2026-07-17):** four governing documents declared (Constitution and Methodology files still to be supplied — flagged; the two available specs carry M1); Netlify confirmed, Lovable historical; **Supabase approved behind a storage abstraction** (M1 ships the abstraction + Blobs driver; the Supabase driver drops in when a project + credentials exist); reviewer identity via existing auth; strategic importance stays UNASSESSED absent strategy config; Runtime engine will be feature-flagged with the existing engine as fallback until production confidence.
>
> **M1 STATUS: Implemented · Tested · Deployed · PARTIALLY production verified.**
> Outstanding for full production verification: one authenticated extraction on
> production by an administrator (`POST /api/evidence/extract` with a completed
> interview's personId, then GET the envelope) — requires the production
> `ADMIN_TOKEN`, which this environment does not hold. Detail — `src/intelligence/{evidence,extraction}.ts` (deterministic §11/§12 core + perception contract), `_evidence-store.mts` (the storage abstraction), `evidence-background.mts` (model perception w/ heuristic fallback — two extractors, one contract), auto-trigger after analysis, admin routes (`GET /api/evidence[/:id]`, `POST /api/evidence/extract` for backfill). Test harness bootstrapped: 11 invariant tests (ceiling, determinism, verbatim anchors, MIXED split, forbidden extractions, pointer routing) + the 18-check durability contract, all green. E2E: submit → analysis → envelope with registered/capped/anchored items, pointers, gap register.

## Milestone 1 — Evidence Layer

**Builds:** `EvidenceItem` (verbatim transcript anchor + interpretation + dimension/topic tags + source class incl. espoused/enacted register + per-item confidence within sensing ceilings) · contradiction links · the gap register · storage + API.
**How without touching the interview:** evidence extraction runs **server-side, post-interview** (a background function beside `analysis-background`), from the transcript + facts that already exist. Zero change to the participant flow or the turn schema. A non-destructive adapter derives evidence items for already-completed interviews.
**Keeps working:** everything. The legacy per-interview report continues to generate exactly as today.
**Testable:** every completed interview yields evidence items, each resolvable to its transcript span; single-source ceiling enforced; adapter output for historical interviews spot-checked; J-invariant test harness bootstrapped (first tests: anchors resolve, ceilings hold).
**Effort:** M–L.

## Milestone 2 — Interview Engine Runtime (the specified engine, built as a third engine)

**Why here:** M1 defines the EvidenceItem object model; this milestone builds its **native producer** — the perception/decision-split engine the Runtime spec specifies. It also permanently answers the standing conversation-quality concerns (the spec formalizes every recommendation from `INTERVIEW_EXPERIENCE_REVIEW.md` §6, which is hereby superseded).

**Builds:** the working-state blackboard (§1) · PERCEIVE as a bounded model call emitting the typed FlagSet, nothing else (§4) · the fully deterministic DECISION core in plain TypeScript — trust machine (§5), topic machine with anchor-before-deepen (§6), lifecycle (§7), one-move dispatcher (§8), probe library + PROBE_SELECT (§9), warrant/stop predicates (§10) · EXTRACT with verbatim anchors, register split, routing, forbidden-extraction guards (§11) · the capped confidence function (§12) · the contradiction router (§13) · stopping predicates + full closure sequence incl. CAPTURE_POINTERS and SAFE_CLOSE (§14) · priors gating replacing today's `priorFindingsFor` injection (§15 — hypothesis topics open neutrally; the current mechanism is retired) · REALIZE as the rendering-only model call under the hygiene contract (§9.2) · per-turn decision log (I11) · named constants as config with spec defaults, PARKED status preserved (§17).

**How without breaking production (the load-bearing design choice):**
- Built as a **third engine behind the existing two-engine contract**. The current live and offline engines keep running untouched.
- **Shadow-tested before it faces anyone:** DECISION is a pure function, so I1–I12 run as unit tests turn by turn, and the whole engine replays against stored production transcripts (PERCEIVE over real utterances, DECISION asserted deterministic) without a single live participant.
- Rollout by feature flag per interview; the offline engine remains the no-dead-end fallback throughout (the invariant that has already saved production once).
- Turn latency note: PERCEIVE is a small bounded call and REALIZE a short generation — two small calls replace today's one large structured call; the 26s budget must be re-measured in shadow mode before rollout (the 502 lesson, applied in advance).

**Testable:** all twelve runtime invariants on every turn of every replayed transcript · determinism (same flags + state ⇒ same move, byte-for-byte) · framing/member-check/closure sequences · leading-count telemetry · handoff emits exactly §14.4's payload into M1's evidence store.
**Effort:** L–XL (the largest single milestone; the spec is written to be transcribed, which contains the risk).

## Milestone 3 — Diagnosis Engine part 1: Findings + the review gate

**Builds:** cross-interview Finding synthesis (F1 corroboration citing items, F2 espoused/enacted + Gap findings, F3 competing/conditioned findings, F4 explicit assumptions) · confidence derivation for findings (§7: corroboration raises, contradiction lowers, ceilings cap) · **the reviewer workflow** — a new internal screen where the AI's *proposed* findings are confirmed/rejected/edited by a named reviewer (§11: AI proposes, humans dispose) · anonymity aggregation in all finding statements (P6).
**AI module separation begins here:** diagnosis reasoning becomes its own module with its own prompt, independent of interview reasoning (the brief's module split, honored stage by stage).
**Keeps working:** legacy pipeline untouched; the new Findings screen is additive.
**Testable:** findings cite their evidence; single-source findings flagged and capped; contradictions produce competing findings, never merged averages; nothing downstream consumes an unconfirmed finding (J2 groundwork); confidence derivations displayed with every finding.
**Effort:** L.

## Milestone 4 — Diagnosis part 2 + Prioritization: the Problem Register

**Builds:** Problem formation over **confirmed** findings only · the three separate confidences (existence/mechanism/extent) · pattern library v1 as versioned configuration (§3.4 seed taxonomy; `novel` admissible) · coverage notes · banded six-dimension prioritization with recorded rationale and dominance-rule tiers (spec's example rules; full table remains PARKED) · the Problem Register screen (tier, rationale, drill to findings).
**Guardrail honored:** Problem objects contain no intervention fields — **J1 enforced by type and by test** from day one.
**Keeps working:** legacy opportunity screens untouched (they now visibly represent the *old* base; labeled as legacy in the internal UI to avoid confusion).
**Testable:** J1 · problems cite only confirmed findings · three confidences derived not asserted · every tier assignment carries rationale (J9) · strategic dimension shows UNASSESSED absent customer config.
**Effort:** L.

## Milestone 5 — Prescription Engine

**Builds:** the full intervention menu as versioned config (§5.2, twelve categories incl. NO ACTION and FURTHER DISCOVERY) · five-question fit assessment per category with recorded rationale — losers retained (§5.3) · precondition tables as config · confidence gates (§5.5; thresholds = provisional config, PARKED honored) · Recommendation objects (§5.4) with derived confidence ≤ problem confidence · sequenced-composite support · discovery addenda feeding the gap register.
**Prescription reasoning is its own AI module**, invoked per problem, only for reviewer-confirmed problems (J2 enforced).
**Testable:** J2 · J3 (full menu incl. losers on every recommendation) · J4 (confidence never exceeds problem's) · J5 (mechanism gate ⇒ FURTHER DISCOVERY) · J7 (no unevidenced quantification) · category distribution stored (neutrality telemetry seed, §8).
**Effort:** L.

## Milestone 6 — Strategy Assembler

**Builds:** portfolios as **filtered views** over recommendations (AI Portfolio finally becomes what it was always supposed to be — one filter among several) · diagnostic deliverables as views over findings/problems (Knowledge Map, Dependency Map — the existing Graph re-based) · Executive Brief with the two credibility sections ("what we recommend against", "what we don't yet know") · Strategic Roadmap via the §6.3 sequencing rules with per-placement rationale.
**Cutover, not rewrite:** the legacy per-interview opportunity/report screens are retired here — replaced by views over the new base; the per-interview report remains stored and viewable as history. Participant flow: untouched, as it has been throughout.
**Testable:** J6 (every brief claim drills to evidence) · J8 (portfolio entries are references) · J9 (roadmap placements carry reasons) · J10 (aggregate confidence = weakest critical component) · brief contains no claim absent below (structural: it is generated from the base).
**Effort:** M–L.

## Milestone 7 — Executive Dashboard + learning seams

**Builds:** dashboard re-based onto the problem/recommendation base with end-to-end drill-down · neutrality telemetry visible (category distribution over time, §8 / P11d) · learning-seam storage completed (pattern instances, full-menu losing arguments, confidence derivation records) · conformance sweep: all J1–J10 running in CI as the release gate.
**Effort:** M.

---

## Cross-cutting commitments (every milestone)

- **Deploy loop:** run locally (`netlify dev`) → contract + J-invariant tests → typecheck/build → browser verification → commit → push → **Netlify** production deploy → production smoke probe. (Per M0-2; "Lovable" pending your resolution.)
- **Backward compatibility:** interview flow and checkpoint durability are never touched by M1–M6 (all intelligence work is post-interview, server-side); legacy analysis runs until M5 cutover; historical interview data is only ever *added to* (adapters), never migrated destructively.
- **Stabilization debt is not abandoned:** open P1s (BL-4…BL-7) ride along — scheduled before M1 starts, since they touch the sensing layer this whole roadmap depends on.
- **Interview-quality proposals** (`INTERVIEW_EXPERIENCE_REVIEW.md` §6) are closed — superseded by the Runtime spec, implemented as Milestone 2.

## What I need from you to begin

M0 items 1–5: the four documents (or the written declaration), deployment confirmation, the datastore decision (A recommended), the minimum reviewer-identity confirmation, and — when available — Cyrix's strategy input for §4.3. **Phase 3 does not start until M0 closes.**
