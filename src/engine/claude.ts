// The live interview engine.
//
// Unchanged in behaviour and shape — the prompts, schemas, fact extraction and
// coverage model all still live in ./prompts.ts and are now executed on the
// server (netlify/functions/_ai.mts). Only the transport moved: the browser no
// longer holds an Anthropic key, which is what lets a participant on their own
// phone talk to the real interviewer instead of the offline fallback.

import type { ChatMessage, Coverage, Fact, ParticipantContext } from '../types'
import { aiCall } from '../api'

// The request carries ONLY this conversation: personId, participant context,
// messages. Organizational memory (prior findings from other interviews) is
// derived server-side from storage — sending the client's interviews map made
// every turn's payload grow with the whole org's data (the 502 chain), never
// worked for participants (their map is empty), and let client-supplied text
// into the system prompt.

export interface TurnResult {
  reply: string
  facts: Fact[]
  coverage: Coverage
}

/** One interview turn: full history in, structured {reply, facts, coverage} out. */
export async function liveTurn(
  model: string,
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
    messages,
  })
}

/** Opening question for a live interview. */
export async function liveOpening(
  model: string,
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
  })
  return reply
}
