// The live interview engine.
//
// Unchanged in behaviour and shape — the prompts, schemas, fact extraction and
// coverage model all still live in ./prompts.ts and are now executed on the
// server (netlify/functions/_ai.mts). Only the transport moved: the browser no
// longer holds an Anthropic key, which is what lets a participant on their own
// phone talk to the real interviewer instead of the offline fallback.

import type { ChatMessage, Coverage, Fact, Interview, ParticipantContext } from '../types'
import { aiCall } from '../api'

export interface TurnResult {
  reply: string
  facts: Fact[]
  coverage: Coverage
}

/** One interview turn: full history in, structured {reply, facts, coverage} out. */
export async function liveTurn(
  model: string,
  interviews: Record<string, Interview>,
  personId: string,
  messages: ChatMessage[],
  participant: ParticipantContext | null,
  inviteToken: string | null,
): Promise<TurnResult> {
  return aiCall<TurnResult>({
    action: 'turn',
    token: inviteToken ?? undefined,
    model,
    personId,
    participant,
    interviews,
    messages,
  })
}

/** Opening question for a live interview. */
export async function liveOpening(
  model: string,
  interviews: Record<string, Interview>,
  personId: string,
  participant: ParticipantContext | null,
  inviteToken: string | null,
): Promise<string> {
  const { reply } = await aiCall<{ reply: string }>({
    action: 'opening',
    token: inviteToken ?? undefined,
    model,
    personId,
    participant,
    interviews,
  })
  return reply
}
