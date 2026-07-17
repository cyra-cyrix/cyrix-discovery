// Shared persistence for the CYRA Discovery pilot.
//
// This is the ONE seam that turns browser-local data into organizational data.
// Netlify Blobs is used because the app already deploys to Netlify: no new
// vendor, no account, no schema, no migration. It is a key/value store, which
// is all the existing domain model needs — People, Invites and Interviews are
// already keyed maps in src/types.ts.
//
// Scale note: this is sized for one pilot (tens of people), not production.
// If the platform standardises on Supabase (13 § build reality), only this
// file and the fetch calls in src/api.ts change; no domain type moves.

import { getStore } from '@netlify/blobs'

const STORE = 'cyra-discovery'

// Keys mirror the domain maps exactly.
const personKey = (id: string) => `people/${id}`
const inviteKey = (token: string) => `invites/${token}`
const interviewKey = (personId: string) => `interviews/${personId}`

function store() {
  return getStore({ name: STORE, consistency: 'strong' })
}

async function readAll<T>(prefix: string): Promise<Record<string, T>> {
  const s = store()
  const { blobs } = await s.list({ prefix })
  const entries = await Promise.all(
    blobs.map(async (b) => {
      const value = (await s.get(b.key, { type: 'json' })) as T | null
      return [b.key.slice(prefix.length), value] as const
    }),
  )
  const out: Record<string, T> = {}
  for (const [k, v] of entries) if (v) out[k] = v
  return out
}

export async function getPerson(id: string) {
  return store().get(personKey(id), { type: 'json' })
}
export async function putPerson(person: { id: string }) {
  await store().setJSON(personKey(person.id), person)
}
export async function deletePerson(id: string) {
  await Promise.all([
    store().delete(personKey(id)),
    store().delete(interviewKey(id)),
  ])
}
export async function allPeople<T>() {
  return readAll<T>('people/')
}

export async function getInvite(token: string) {
  return store().get(inviteKey(token), { type: 'json' })
}
export async function putInvite(invite: { token: string }) {
  await store().setJSON(inviteKey(invite.token), invite)
}
export async function allInvites<T>() {
  return readAll<T>('invites/')
}

export async function getInterview(personId: string) {
  return store().get(interviewKey(personId), { type: 'json' })
}
export async function putInterview(interview: { personId: string }) {
  await store().setJSON(interviewKey(interview.personId), interview)
}
export async function allInterviews<T>() {
  return readAll<T>('interviews/')
}
