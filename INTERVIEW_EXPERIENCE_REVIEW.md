# Interview Experience Review — CYRA Discovery

**Date:** 2026-07-17 · Phase: stabilization (post-P0, production-verified resume).

> **Implementation status (same day):** §1–§5 implemented and verified in the browser —
> bubble text measured `rgb(255,255,255)` on `rgb(11,11,11)` (was identical values);
> welcome bullets visible with on-scale rhythm; `dvh` layout; staged indicator shows
> "Saving your answer" → "The consultant is thinking" and "The consultant is joining"
> replaces the pre-opening blank; the input mode is dissolved (permanent mic +
> "Read aloud / Stop reading" toggle); mic-permission denial now explains itself;
> summary link is a 44px tertiary button; voice-rule fixes applied. Regression:
> typecheck clean · build clean · contract suite 18/18.
> **§6 (conversation intelligence) remains unimplemented by design — awaiting joint review.**
> Backlog items closed by this phase: BL-8, BL-9, BL-10, BL-24, BL-25, BL-26, BL-29, BL-30, BL-36.
Method per issue: reproduce → root cause → classify → impact → smallest fix. Implementation follows this review; conversation-intelligence changes are **recommendations only** (§6), held for joint review.

---

## 1 · User messages unreadable in dark bubbles

- **Reproduced:** computed style on a live user bubble: background `rgb(11,11,11)`, text color `rgb(11,11,11)` — *identical*. The participant's own words are invisible pixels; the audit's mobile screenshot (solid black rectangles) had already captured this and was misread as seeded data.
- **Root cause:** the bubble is `bg-ink … text-white` (Portal.tsx:721). The CYRA Tailwind theme **replaces** the color palette, and `white` is not a token — so `text-white` silently compiles to nothing and the text inherits the body color, `ink` (#0B0B0B), on an ink background. Not opacity, not dark mode, not render order: a dead utility class.
- **Systemic finding:** this is a *family*. The replaced scales make every off-token class vanish silently (the config comment says such values "fail to compile" — they don't; they disappear). Full sweep found: `text-white` (Portal:721, Dashboard:344, Dashboard:489 — invisible text on the internal side too), `space-y-4.5` + `h-1.5 w-1.5` (Portal welcome list: no rhythm, invisible bullets — screenshot-confirmed), `h-1 w-1` (Portal:842 summary bullets), `h-1.5 w-1.5` (Dashboard:193, 369), `h-2.5 w-2.5` (Dashboard:454), `h-3 w-3` (Graph:174, 177).
- **Classification:** Visual (P0-of-this-phase — the participant cannot read their own answers).
- **Impact:** every participant, every message they send, on every device. The single largest trust-destroyer in the product.
- **Smallest fix:** `text-white` → `text-paper` (the token that *is* white); dots → `h-2 w-2` (8px, on-scale); `space-y-4.5` → `space-y-4`. No design change — this restores the *intended* design.

## 2 · Mobile conversation layout

- **Root cause (one mechanism, three symptoms):** the conversation column is `h-[calc(100vh-64px)]` (Portal.tsx:662). On mobile browsers `100vh` is the *largest* viewport — it ignores the URL bar and the keyboard. So the column is taller than the visible screen: the composer footer renders partly below the fold ("conversation overlaps the footer", "messages partially hidden"), and because the page itself now overflows, the participant gets **two nested scroll contexts** — body scroll and the message rail — which is exactly "scrolling feels inconsistent". With the keyboard open (iOS especially) the composer is fully hidden — audit finding BL-8.
- **Secondary:** `scrollTo({behavior:'smooth'})` fires on *every* message-count change, including the initial mount of a resumed transcript — a long animated scroll from the top on resume reads as jank. "Uneven spacing" is issue 1's dead classes, not the message list (which uses on-scale `space-y-4`).
- **Classification:** Usability (mobile) — P1-of-this-phase.
- **Impact:** every phone participant (the primary device for a link sent to a department head).
- **Smallest fix:** `100dvh` instead of `100vh` (dynamic viewport unit — tracks URL bar and keyboard; the standard remedy, no layout redesign), body overflow pinned while in conversation is *not* needed once heights are right; scroll: `behavior:'auto'` on first paint, `smooth` only for appended messages.

## 3 · "Reading your answer" doesn't say what is happening

- **Reproduced:** one static label covers the whole turn (save + model call), and *before the opening question* there is no state at all — a blank chat (audit BL-10).
- **Root cause:** `thinking` is a single boolean; the stage string is fixed at "Reading your answer". The design system's own rule is that indeterminate work must name **the real step** — the current label names none of them.
- **Classification:** Usability.
- **Impact:** the participant can't tell saving from thinking from stuck — precisely the uncertainty that erodes trust when a turn takes 10+ seconds on the live engine.
- **Smallest fix (states named after what is actually happening, in sequence):**
  1. Pre-opening: "The consultant is joining." (indicator instead of blank chat; composer disabled until the opening lands.)
  2. While the checkpoint write is in flight: "Saving your answer…" — this is *true* (the answer is durably stored before the AI is asked anything).
  3. While the model call runs: "The consultant is thinking…"
  No spinners, no typing theatrics — same `WorkingRule` hairline, staged text at real boundaries.

## 4 · "Switch to Typing / Switch to Voice" — interaction model review

- **Evaluation.** The current model makes *input modality* a screen-level mode: chosen upfront (two cards), switched via a header command. Three problems. (1) **Mental model:** participants think "answer the question", not "operate an input mode"; a mode is interface state they must remember and manage. (2) **Discoverability:** a typist never discovers voice mid-interview (the header button reads as a settings command, not an invitation); a voice user who wants to correct one word must "switch modes" to type — though the *implementation* already feeds both into one textarea. (3) **Convention:** every conversational product participants already know (WhatsApp, ChatGPT, iOS dictation) uses a **persistent composer with an inline mic** — no mode.
- **Root cause:** `voiceMode` conflates two independent things: *input* (mic → transcription into the draft) and *output* (questions read aloud). Input never needed to be a mode — transcription already lands in the same textarea. Output (TTS) is the only genuine mode.
- **Recommendation (this is the WHY before the change):** dissolve the input mode; keep the output mode, named for what it does.
  - The mic button is **always present** in the composer when the browser supports speech — tap to dictate, text lands in the draft for review, exactly as today. Typing is always available. Nothing to switch.
  - The header control becomes **"Read aloud on / off"** — the honest name for the one real mode (should the consultant's questions be spoken). The context form's Type/Speak choice stays as the initial preference but now only sets "read aloud" — its copy already promises exactly that experience.
  - This is a *simplification to the intended architecture*, not a redesign: fewer concepts, fewer controls, zero new capabilities.
- **Classification:** Usability. · **Impact:** every participant touches the composer; voice users are the stated accessibility audience for a 1,200-engineer field org.

## 5 · Overall polish (confidence, not beauty)

Reproduced/verified items, each with the smallest fix:
| Item | Root cause | Fix |
|---|---|---|
| Welcome list cramped, bullets invisible | dead `space-y-4.5`, `h-1.5 w-1.5` | on-scale tokens (§1 family) |
| Summary/Dashboard/Graph dots invisible | dead `h-1/h-1.5/h-2.5/h-3` | `h-2 w-2` |
| Dashboard invisible text ×2 | dead `text-white` | `text-paper` |
| "Continue the conversation instead" is a ~20px target next to 44px buttons | bare text link | `.btn-tertiary` (44px min-height, consistent voice) |
| `ADDED ✓` — glyph + literal caps break the voice rules | ad-hoc confirmation | sentence-case "Added to your record" in success tone |
| Headings missing terminal periods ("A little context about you", "What I understood") | voice drift | add periods (display headings are finished sentences) |
| No focus move on step transitions — keyboard/SR users stranded on body | conditional render swaps | focus the new step's heading (`tabIndex={-1}`) |
| className double-spaces (deleted-class scars) | editing residue | tidy while touching those lines |

Deliberately **not** touched: layout structure, color roles, type scale, component shapes — the design language is right; it was the execution details that leaked.

**Classification:** Visual/Usability. **Impact:** individually small; together they are the difference between "prototype" and "someone sweated this".

---

## 6 · Conversation intelligence — review only, NO implementation

**Evaluated:** the live interviewer system prompt (`src/engine/prompts.ts`), turn schema, the offline engine's strategy (`simulated.ts`), and transcripts generated this session. Not evaluated: real live-engine transcripts at production quality — that requires interviews with the key set, which only production can produce.

**What is already good:** one-question-at-a-time discipline; "follow the energy" heuristic; gentle quantification; the no-AI-pitching guardrail; the wind-down contract; per-turn fact extraction with dimension tagging; the confirmation step. The offline engine's signal table produces plausibly contextual follow-ups (observed: WhatsApp → auditability probe; delay → "what is everyone doing while they wait").

**Gaps, in priority order, with proposed (unimplemented) changes:**

1. **No anti-repetition mechanism.** The model re-reads the transcript each turn but is never told to check what it already knows. Proposal: inject the accumulated `facts` list into the system prompt each turn ("You have already established: …. Never re-ask these; build on them.") — the data already exists server-side per turn.
2. **No depth contract.** "Follow the energy" doesn't define *done* for a thread. Proposal: "Stay on a pain point until you have frequency, time cost, who is involved, and the current workaround. Only then move." This is the difference between anecdotes and evidence an Innovation Team can act on.
3. **Coverage vector unused for steering.** The model self-scores 10 dimensions but is never told to *use* the scores. Proposal: "When the current thread is exhausted, probe the least-covered dimension" (the offline engine already does this — the live one should too).
4. **Tacit-knowledge elicitation is untargeted.** `knowledgeLoss` is a listed goal with no technique. Proposal: add two named probes — critical incident ("walk me through the last time X went wrong") and absence test ("what would stall within a week if you were unreachable — and who would notice first").
5. **Wind-down may never trigger.** "Most dimensions ≥ 0.7" is rarely reached in 20 minutes; interviews risk running long with no landing. Proposal: add a soft turn-budget signal ("after ~15 answers, prioritize the most valuable remaining gap, then land").
6. **The `effort:'low'` tension (flagging my own change).** BL-1b set turn effort to `low` for latency. That is the right call for the 502, but its effect on follow-up quality is *unmeasured*. Proposal: once production latency is known from the function log, evaluate `medium` against the timeout headroom. This is a measurement task, not a prompt change.

**Would an Innovation Team learn something valuable today?** From the *live* engine with the gaps above unaddressed: probably yes for pain-point inventory (the extraction schema forces it), less reliably for depth and tacit knowledge — threads can end one question too early, exactly as observed. Items 1–4 are prompt-only changes, cheap to apply and cheap to reverse; none touch code paths. **Awaiting joint review before any of them is implemented.**
