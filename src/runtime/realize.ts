// REALIZE — the second and last model-assisted step (§2). It never chooses
// what to do; it renders the already-chosen move into words under the §9.2
// hygiene contract. One move in, one single-barrelled non-leading question out.

import type { Move } from './state'
import type { ParticipantContext } from '../types'

export const REALIZE_SYSTEM = `You are the RENDERING stage of a deterministic interview engine for organizational discovery at Cyrix Healthcare. A decision layer has already chosen the move; your only job is to word it as ONE conversational message.

Hygiene contract (binding — violations are counted as engine defects):
- Exactly one question (or closure statement). Never two questions in one turn.
- Open and non-leading: never suggest the expected answer, never import conclusions from other interviews, never name what "we've heard elsewhere".
- Use the participant's own terms from the recent exchange; plain language; warm, precise consultant tone. No flattery, no emoji, no exclamation marks.
- Brief acknowledgment of what they just said (one clause), then the move.
- Never promise outcomes; never recommend solutions or AI; never evaluate named individuals.`

/** Move → rendering instruction. Deterministic text; the model words it. */
export function realizeInstruction(move: Move, detail: string, topicLabel: string | null, participant: ParticipantContext | null): string {
  const who = participant ? `Participant: ${participant.designation}, ${participant.stateBranch}. Their stated responsibility: "${participant.responsibility}".` : ''
  const topic = topicLabel ? `Active topic, in their terms: "${topicLabel}".` : ''
  const map: Record<Move, string> = {
    FRAME_STATEMENT: 'State the interview frame plainly: this is not an evaluation, there are no right answers, what they share is seen only by the Innovation Team, and ask if they are ready to begin.',
    REPAIR_MOVE: 'Trust needs repair. Truthfully restate that this is not an evaluation and answers are seen only by the Innovation Team, then offer plainly: skip this topic, pause, or stop entirely. Do not probe.',
    ACKNOWLEDGE_AND_ADVANCE: 'They declined the last question. Accept that without apology or pressure, and move to a different area.',
    REDIRECT_MOVE: 'Redirect away from evaluating people or sensitive territory: convert to a question about the process or constraint involved, not about any person.',
    CONTRADICTION_MOVE: 'Two things they said do not quite line up. Gently ask them to help you reconcile — non-accusatory, no implication of an expected answer.',
    ANCHOR: 'Ask for one concrete recent instance: "walk me through the last time" this actually happened — a specific day, a specific case.',
    CDM_DEEPEN: `Critical-decision probe, pass "${detail.replace('cdm:', '')}": timeline = what happened step by step; cues = what they noticed that told them something; options_basis = what options they weighed and what the choice turned on; counterfactual = what would have happened otherwise / what a less experienced person would have done.`,
    POINTER_CAPTURE: 'They pointed at knowledge held by someone or somewhere else. Capture the pointer: who holds it, under what circumstances it is needed, how people reach it. Do not force them to articulate the content itself.',
    DECISION_RULE_PROBE: 'They said "it depends". Ask: depends on what, specifically — what tells them which way to go?',
    DECISION_BASIS_PROBE: 'They glossed over a decision. Ask what they actually look at when making that call.',
    MECHANICS_PROBE: 'They were vague. Ladder down one level into the mechanics of how that actually works.',
    CONSTRAINT_PROBE: 'There was emotion in that answer. Ask, respectfully, what makes that part hard — the constraint behind the frustration.',
    CLARIFY: 'They hedged. Ask a short clarifying question about what they meant.',
    LADDER_DOWN: 'Go one level more concrete on the same thread.',
    GAP_TEST: detail.includes('need-enacted')
      ? 'You have the official version. Ask how it actually goes in practice — the last real time.'
      : 'You have the practice. Ask what the official/expected way is supposed to be.',
    NEXT_TOPIC: 'Transition naturally to the new active topic with one open question in their terms.',
    OPEN_NEXT_TOPIC: 'Open the new active topic with one open question in their terms.',
    ORIENT: 'Orienting: ask them to walk through a recent ordinary working day — where their time actually went.',
    MEMBER_CHECK: 'Closing member-check: reflect the few most important things you understood, in their words, and ask whether you got them right — invite correction.',
    CAPTURE_MISS: 'Ask: what should I have asked about that I did not?',
    CAPTURE_POINTERS: 'Ask who else really knows how this work happens — whose picture would complete it.',
    SAFE_CLOSE: 'Close plainly: thank them (once, without gushing), restate that their words are seen only by the Innovation Team, and note they can add or retract anything later through the team.',
  }
  return [who, topic, `MOVE: ${map[move]}`].filter(Boolean).join('\n')
}

/** Bounded conversational context: the last few exchanges only. */
export function realizeContext(messages: Array<{ role: string; text: string }>, n = 6): string {
  return messages.slice(-n).map((m) => `${m.role === 'ai' ? 'YOU' : 'PARTICIPANT'}: ${m.text}`).join('\n')
}
