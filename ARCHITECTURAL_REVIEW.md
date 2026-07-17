# Architectural Review — CYRA Discovery MVP vs. Intelligence Layer Blueprint

**Date:** 2026-07-17 · Phase 1 deliverable. Companion: `IMPLEMENTATION_ROADMAP.md` (Phase 2).
**Reviewed:** the complete codebase (every source file, both engines, all functions, the data model, auth, deliverables — this session also audited and stabilized all of it) against the authoritative specification.

---

## 0 · Specification availability — read this first

Of the five documents declared authoritative, **two are available**:
1. `CYRA_DISCOVERY_INTELLIGENCE_LAYER.md` (Blueprint v1.0) — everything after the interview.
2. `CYRA_INTERVIEW_ENGINE_RUNTIME.md` (Executable Reasoning Specification v1.0) — the engine's runtime decision procedure. *(Supplied after this review's first draft; §1.5 below is the resulting sensing-layer conformance assessment.)*

**Still missing:** `CYRA_DISCOVERY_PLATFORM_CONSTITUTION.md` (the law both documents bind to) and `CYRA_INTERVIEW_ENGINE_SPEC.md` (the methodology). Both available docs cite the Constitution concretely (P1 espoused/enacted · P3 · P4 corroboration & ceilings · P5 traceability · P6 anonymity/framing · P7 contradiction preservation · P8 pointer-routed tacit knowledge · P9 do-no-harm/functional informality · P10 conditioned accounts · P11 proposed neutrality · §7/§11 "AI proposes, humans dispose" · D6 drillability · D9 sensitive-content governance · D10 benchmarking parked). This review treats those citations as binding where they appear; where a judgment needs the full Constitution or Methodology text, the relevant row says **UNASSESSABLE**.

## 0.1 · Brief-vs-reality conflicts (must be resolved before Phase 3)

| The brief says | The codebase is | Position |
|---|---|---|
| "Deploy to **Lovable**" | Vite + React + **Netlify** Functions + Netlify Blobs, live at cyrix-discovery.netlify.app, auto-deploying from GitHub `main` | No Lovable artifact exists anywhere in this project. Migrating platforms would violate the brief's own rules ("never rewrite", "maintain production stability"). Assumed to be a template artifact — **deployment stays Netlify unless you say otherwise.** |
| "**Database** … prefer migrations" | No database. Netlify Blobs key/value store, with a documented swap seam (`_store.mts` + `src/api.ts` only) | The Intelligence Layer's object model (evidence ⟷ findings ⟷ problems ⟷ recommendations, many-to-many, review states, versioned config libraries) strains a KV store. This is exactly the moment the documented Supabase seam was designed for. Decision required — options in the roadmap's Milestone 0. |
| "**Authentication**" | One shared `ADMIN_TOKEN` + per-participant invite tokens. No individual identity. | Reviewer gates (F5, §5.1) require an auditable "who confirmed this finding". A shared token cannot attribute. Minimum viable answer proposed in Milestone 0. |

---

## 1 · Existing architecture — what the MVP actually is

**One sentence:** a production-stable *sensing* MVP (interview → per-interview AI analysis → per-interview report/opportunities) with **no intelligence layer** — the space between "interview ends" and "executive reads" is currently filled by a single generative leap.

### What already matches the architecture

- **The sensing mechanism works and is durable.** Interview engine with two interchangeable engines (live + offline), per-turn fact extraction tagged to 10 dimensions, coverage self-assessment, participant confirmation step ("What I understood" — a real validation boundary), checkpoint/resume durability verified in production. The interview is genuinely treated as a sensing instrument, and it survives network loss, refresh, AI failure.
- **Provenance labeling exists at the presentation edge:** machine output carries `DRAFT — UNVALIDATED` + `ProvenanceLine` (P5-adjacent, D6-adjacent in spirit).
- **"Deliverables as views" exists in embryo:** the Dashboard, Graph, and Founder Briefs render *from* stored analysis objects; they do not compute new claims. The org model is emergent (departments derived from interviews, never predefined) — consonant with evidence-first philosophy.
- **Anonymity posture partially present:** participant-facing copy never leaks other interviews; but see conflicts — briefs quote individuals' words with team attribution, which P6 aggregation rules may or may not permit (UNASSESSABLE without the Constitution's §6 text).

### What partially matches

- **Facts ≈ proto-evidence.** Each `Fact {dimension, text}` is an extracted claim bound to one interview (source known). Missing for spec conformance: verbatim transcript anchor, interpretation-vs-quote separation, source/register class (espoused vs enacted), per-item confidence, contradiction linkage, gap register.
- **Graph ≈ proto-dependency-map.** Emergent team nodes, mention edges, cross-team patterns from shared pain categories. It is a view, but over per-interview output, not over validated Findings.
- **Founder brief ≈ proto-executive-brief.** Narrative synthesis exists, but per-team, generated in the same single leap, with no "what we recommend against" and no "what we don't yet know" sections — the two sections §6.2 calls the credibility core.
- **`priorFindingsFor` ≈ proto-cross-interview memory.** Severe pain points feed later interviews' prompts (server-side, post-stabilization). It is memory for *questioning*, not synthesis.

### What conflicts with the architecture (defects by the spec's own definitions)

1. **P11 is violated by construction.** `OpportunityType` is an intervention-branded, AI-dominated closed set (`'Knowledge AI' | 'Decision AI' | … | 'Workflow Automation' | 'Copilot'`). The analysis prompt asks the model to produce AI opportunities directly from a transcript. Diagnosis and prescription are fused inside one generation; intervention thinking happens *during* (indeed, instead of) diagnosis. The spec names this exact shape an architectural defect (§2d) and J1 outlaws its data shape. The platform, as built, is structurally an AI-opportunity finder — the thing §2 says a discovery instrument must not be.
2. **The one-leap synthesis anti-pattern.** Transcript → 12-section report + opportunities + profile in one 16k-token generation is precisely §3.1's "evidence→problem in one leap is where hallucinated synthesis happens." There is no Findings rung, so no inference is testable at the rung where it was made.
3. **Confidence is asserted, never derived.** `Opportunity.confidence: 0–100` is a number the model states in the same breath as the claim. §7's first binding rule ("derived at every step, asserted at none") fails at the only place confidence exists. There are no ceilings, no corroboration effects, no three-way problem confidence, no propagation.
4. **No reviewer gate anywhere.** J2 ("no prescription before reviewer-confirmed diagnosis") cannot even be expressed: there is no reviewable object between transcript and recommendation, no review workflow, no reviewer identity. (This was already open issue C5/E6 in the standing audit — the spec now makes it structural, not cosmetic.)
5. **Numeric scoring theater.** `impact: 1–10, effort: 1–10` priority matrix is exactly the "numeric weighted-sum … false precision" §4.1 replaces with banded comparative judgment plus recorded rationale.
6. **Per-interview silo.** Analysis runs per interview; problems that span interviews (the spec's central object) have no home. Cross-interview corroboration (§3.5) — the mechanism that *raises* confidence — does not exist.
7. **Quantification without evidence.** The simulated analyst (and prompt guidance) produce effect statements not bound to quantifying evidence — J7 has no enforcement point.

### 1.5 Sensing-layer conformance vs. the Interview Engine Runtime spec

Now assessable. Verdict: **the built engine is a different architecture from the specified one.** The spec demands a perception/decision split — model-assisted PERCEPTION emitting a typed flag set, fully deterministic DECISION over state machines, model-assisted REALIZE rendering the already-chosen move. The built live engine is a single prompted model call that perceives, decides, and realizes in one breath, with none of the runtime state.

**What already conforms (genuinely, and worth keeping):**
- **FRAMING exists in the UI, not the engine — and mostly satisfies §3.** The Welcome screen is a frame statement (not-an-evaluation, no right answers, who sees the data), and "I'm ready — let's begin" is a frame acknowledgment before any substantive question. The context form is ORIENTING-shaped (role, real work). Trust-frame *re-statement* (§5.2 repair) has no equivalent.
- **MEMBER_CHECK and CAPTURE_MISS exist (§14.3):** the "What I understood" summary is a member check the participant corrects, and "Add or correct something" is capture-miss. Both feed back into the record. CAPTURE_POINTERS and SAFE_CLOSE's retraction-right restatement are absent.
- **The offline engine is architecturally *closer* to the spec than the live one.** Its regex signal table is a crude PERCEPTION (typed signals), and its deterministic follow-up selection is a crude dispatcher. The spec is, structurally, the offline engine's philosophy applied to the live engine with the model confined to perception and rendering. This is encouraging: the codebase already contains the pattern in miniature.

**What is missing wholesale (each a spec section with no implementation):** typed FlagSet perception (§4) · trust state machine and repair procedure (§5) · topic state machine with anchor-before-deepen (§6) · lifecycle states (§7 — current engine has no conversation state at all) · the one-move dispatcher and its precedence (§8, I1) · the probe library and PROBE_SELECT tree (§9) · probe-warrant/stop-probe predicates incl. fatigue and over-probing protection (§10) · extraction rules producing EvidenceItems with verbatim anchors, register split, source quality, routing, forbidden-extraction guards (§11, I4–I7) · the deterministic capped confidence function (§12) · the contradiction router (§13, I8) · stopping predicates and the closure sequence beyond member-check (§14) · priors gating (§15) · the decision log (I11) · all twelve runtime invariants as tests.

**Active conflicts (not just gaps):**
- **§15 priors gating is currently violated in spirit.** `priorFindingsFor` injects prior interviews' pain-point *conclusions* into the system prompt with instructions to probe them. The spec's FORBIDDEN list bans injecting prior conclusions into questions and requires hypothesis topics to open neutrally with disconfirmation-seeking. The current mechanism has no neutrality constraint and no leading-question defect counter.
- **Turn output shape:** `{reply, facts, coverage}` has no decision log, no flags, no move identity — nothing I11 requires; and coverage is a self-reported model opinion where the spec derives topic state from typed events.
- **`Fact` vs. `EvidenceItem`:** no verbatim anchor (I5 unrepresentable), no register (I4), no source quality, no elicitation provenance, no per-item confidence (§12), no forbidden-extraction guards (I7 unenforceable).

**Consequence for the intelligence layer:** the runtime spec's HANDOFF (§14.4) is precisely the input contract the Intelligence Layer expects. Building the evidence layer as a *retrofit adapter* over today's facts (as the roadmap's M1 does) is a bridge, not conformance — native, in-interview evidence production comes only from implementing this spec.

**Resolution of an open item:** the conversation-intelligence recommendations in `INTERVIEW_EXPERIENCE_REVIEW.md` §6 (anti-repetition, depth contract, coverage steering, tacit-knowledge probes, wind-down) are **superseded by this spec**, which formalizes every one of them (buffer-aware extraction; anchor-before-deepen + CDM passes; dispatcher + NEXT_TOPIC priority; POINTER_CAPTURE + sig_inarticulable; stopping predicates). They should be implemented as *this spec*, not as prompt tweaks — the pending joint review of §6 is closed by this document's arrival.

### Technical debt register (carried from the standing stabilization audit)

Open P1s: BL-4 (two-tab merge), BL-5 (deleted-person resurrection), BL-6 (re-interview confirm), BL-7 (chat log aria-live). Open P2 batch (BL-16…BL-28). Blobs writes non-atomic (relevant to any new object store on Blobs). No test framework (both spec documents demand invariant tests — I1–I12 and J1–J10). Conversation-intelligence §6 recommendations: **closed — superseded by the Interview Engine Runtime spec** (see §1.5).

### Assumptions in the MVP that conflict with the architecture

- "The interview's analysis is the product" (per-interview report) vs. spec: the product is the cross-interview intelligence; per-interview output is input.
- "AI opportunity" as the atomic unit of value vs. spec: the intervention-neutral Problem is the atomic unit; AI is one of twelve menu categories, and "NO ACTION"/"FURTHER DISCOVERY" are first-class.
- "Confidence is a model opinion" vs. spec: confidence is a derived, monotonically non-increasing property of the evidence graph.
- "Reports are generated" vs. spec: deliverables are assembled *views*; generation happens only below, at synthesis rungs, under review gates.

---

## 2 · Gap analysis — spec component vs. MVP status

| Spec component | Status | Evidence / gap |
|---|---|---|
| Interview / sensing runtime | **PARTIAL — different architecture** (see §1.5) | Durable and production-verified, but a single-prompt engine, not the specified perception/decision split. Conforming pieces: UI-level FRAMING, member check, capture-miss, the offline engine's signal-table pattern. Missing: state machines, dispatcher, typed extraction, confidence function, contradiction router, decision log, invariants I1–I12. Priors gating actively violated by `priorFindingsFor`. |
| Evidence Layer (items w/ verbatim anchor, interpretation, tags, class, confidence; contradictions; gap register) | **MISSING** (facts are a seed) | `Fact {dimension, text}` only. No anchors, no per-item confidence, no register classes, no contradiction objects, no gap register. |
| Diagnosis — Findings (F1–F5) | **MISSING** | No finding objects, no corroboration gate, no espoused/enacted discipline, no competing/conditioned findings, no reviewer confirmation. |
| Diagnosis — Problems (§3.3) | **MISSING** | No problem objects; J1's required shape (no intervention fields) is violated by the nearest analogue (opportunities). |
| Diagnostic pattern library (§3.4, versioned config) | **MISSING** | `OpportunityType` is intervention-branded — explicitly not the pattern library. No versioned-config mechanism exists. |
| Cross-interview synthesis (§3.5) | **MISSING** | Only `priorFindingsFor` prompt-feeding; no merging, no corroboration-driven confidence, no coverage notes. |
| Prioritization (§4 banded judgment, tiers, rationale) | **MISSING** (current numeric matrix is the anti-pattern) | impact/effort 1–10; no dimensions, no tiers, no recorded rationale; customer strategy input (§4.3) has no configuration home. |
| Prescription Engine (§5 full menu, five questions, gates) | **MISSING** | AI-only opportunities; no menu, no losing arguments, no NO-ACTION/FURTHER-DISCOVERY, no preconditions, no gates. |
| Recommendation objects (§5.4) | **MISSING** | Opportunity lacks: problem_ref, mechanism argument, full-menu assessment, derived confidence, discovery addendum. |
| Strategy Assembler — portfolios as views (§6.1) | **MISSING** (partial precursor) | Opportunity screens exist but are the base itself, not views over recommendations. |
| Executive Brief (§6.2 incl. recommend-against + don't-know sections) | **PARTIAL precursor** | Founder brief exists; wrong base, wrong sections, no drillability. |
| Strategic Roadmap (§6.3 sequencing w/ rationale) | **MISSING** | No roadmap object at all. |
| Confidence Spine (§7) | **MISSING** | Asserted numbers only; no derivation, ceilings, propagation, or displayed derivations. |
| Traceability / drill-down J6 (claim → … → evidence) | **MISSING beyond one hop** | Opportunity→personId exists; nothing resolves to evidence items (which don't exist). |
| Executive Dashboard | **PARTIAL** | Exists and is stable; built over per-interview aggregates; must become views over the problem/recommendation base. |
| Knowledge Graph / diagnostic deliverables (§6.1 views over Findings) | **PARTIAL** | Emergent graph is real but views over per-interview edges, not Findings. |
| Learning seams & neutrality telemetry (§8) | **MISSING** | Nothing stored for pattern instances, losing arguments, calibration, or category-distribution monitoring. |
| Invariants J1–J10 as tests | **MISSING** | No test framework exists in the repo at all. |
| PARKED items (§4.2 table, §5.5 thresholds, F5 sampling, financial sizing, benchmarking) | **Correctly absent** | Nothing invented — these remain parked per spec; the roadmap keeps them as explicit configuration stubs. |

---

## 3 · Review verdict

The MVP is a **production-hardened conversation platform wearing both layers' clothes**. Downstream of the interview, everything is a single-leap generative approximation of the four-stage, review-gated, confidence-derived pipeline the Intelligence Layer specifies. *Inside* the interview, the engine is a well-behaved prompt where the Runtime spec requires a deterministic decision core with the model confined to perception and rendering. What the stabilization phase proved is that the chassis — durability, resume, deployment, the two-engine failsafe — is trustworthy; what this review shows is that both specified brains (the runtime's and the intelligence layer's) are still to be built. Neither needs a rewrite of the working platform: the runtime engine can be built as a new engine behind the existing two-engine contract and shadow-tested on real transcripts before it ever faces a participant, and the intelligence pipeline can be built beside the legacy analysis, with screens cut over stage by stage. That is the shape of the roadmap.
