// Client seam for shared persistence.
//
// Everything the app knows about the backend lives here. The domain types are
// unchanged (src/types.ts); only the transport moved from localStorage to the
// pilot API. Swapping Netlify Blobs for Supabase later touches this file and
// netlify/functions/_store.mts — nothing else.

import type { Interview, Invite, Person } from './types'

const ADMIN_TOKEN_KEY = 'cyra-admin-token'

export const getAdminToken = (): string => localStorage.getItem(ADMIN_TOKEN_KEY) ?? ''
export const setAdminToken = (t: string) => localStorage.setItem(ADMIN_TOKEN_KEY, t)
export const clearAdminToken = () => localStorage.removeItem(ADMIN_TOKEN_KEY)

async function call<T>(path: string, init: RequestInit = {}, admin = false): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...(init.headers as object) }
  if (admin) headers.authorization = `Bearer ${getAdminToken()}`
  const res = await fetch(`/api/${path}`, { ...init, headers })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

// ---------- Innovation Team ----------

export interface SharedState {
  people: Record<string, Person>
  invites: Record<string, Invite>
  interviews: Record<string, Interview>
}

/** The whole pilot dataset. Doubles as the credential check for the gate. */
export const fetchState = () => call<SharedState>('state', { method: 'GET' }, true)

export const putPerson = (person: Person) =>
  call('person', { method: 'PUT', body: JSON.stringify(person) }, true)

export const deletePerson = (id: string) =>
  call(`person/${id}`, { method: 'DELETE' }, true)

export const putInvite = (invite: Invite) =>
  call('invite', { method: 'PUT', body: JSON.stringify(invite) }, true)

export const putInterview = (interview: Interview) =>
  call('interview', { method: 'PUT', body: JSON.stringify(interview) }, true)

// ---------- Participant (the invitation token is the credential) ----------

export type InviteDecision = 'accept' | 'disabled' | 'completed' | 'unknown'

export interface ResolvedInvite {
  decision: InviteDecision
  person?: Person
  invite?: Invite
  /** An interview already underway for this invitation, if any. Present
   *  whenever the decision is `accept` and the participant has started — this
   *  is what the portal resumes from. Never present once complete: a finished
   *  interview resolves to `completed` instead. */
  interview?: Interview | null
}

/** Resolves an invitation against shared storage — this is what makes a link
 *  work on a device that has never seen the roster, and what makes it resume. */
export const resolveInvite = (token: string) =>
  call<ResolvedInvite>(`invite/${encodeURIComponent(token)}`, { method: 'GET' })

export interface CheckpointAck {
  ok?: true
  /** Set when the server deliberately dropped the write: `stale` (a newer
   *  revision is already stored) or `generating` (the conversation is over).
   *  Both mean "stop retrying" — neither is a failure. */
  ignored?: 'stale' | 'generating'
  revision?: number
}

/** Persist an in-flight interview. Authorised by the participant's invitation,
 *  or by the admin bearer for an internal test-run (no token). */
export const checkpointInterview = (token: string | null, interview: Interview) =>
  call<CheckpointAck>('checkpoint', {
    method: 'POST',
    body: JSON.stringify({ token: token ?? '', interview }),
  }, !token)

export const submitInterview = (token: string, interview: Interview, person: Person | null) =>
  call<{ ok: true; status: string }>('submit', {
    method: 'POST',
    body: JSON.stringify({ token, interview, person }),
  })

export const pollInterviewStatus = (token: string) =>
  call<{ status: string }>(`interview/${encodeURIComponent(token)}`, { method: 'GET' })

// ---------- AI (the key stays on the server) ----------

export const aiCall = <T>(body: Record<string, unknown>) =>
  call<T>('ai', { method: 'POST', body: JSON.stringify(body) }, !body.token)
