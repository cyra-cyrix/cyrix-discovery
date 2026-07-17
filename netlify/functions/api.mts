// CYRA Discovery — pilot API.
//
// One synchronous function, routed by path. Everything here is short-running.
// The long report analysis lives in analysis-background.mts because it exceeds
// the synchronous function limit.
//
// Auth model (replaces the decorative front-end gate):
//   - Innovation Team routes require `Authorization: Bearer <ADMIN_TOKEN>`,
//     verified server-side against an env var.
//   - Participant routes authenticate with their invitation token, which is
//     resolved against central storage — the token IS the credential.
// The Anthropic key never leaves the server (participants hold no key).

import type { Config, Context } from '@netlify/functions'
import type { Interview } from '../../src/types.ts'
import {
  allInterviews, allInvites, allPeople,
  deletePerson, getInterview, getInvite, getPerson,
  putInterview, putInvite, putPerson,
} from './_store.mts'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const isAdmin = (req: Request) => {
  const expected = Netlify.env.get('ADMIN_TOKEN')
  if (!expected) return false
  const header = req.headers.get('authorization') ?? ''
  return header === `Bearer ${expected}`
}

/** A participant is authorised by an active, uncompleted invitation. */
async function resolveInvite(token: string) {
  if (!token) return null
  const invite = (await getInvite(token)) as { status: string; personId: string; completedAt: number | null } | null
  return invite ?? null
}

/** The route, resolved from either entry shape: the declared `/api/*` path or
 *  a `/.netlify/functions/api/...` rewrite. Deriving it from the URL keeps the
 *  two in agreement instead of depending on which one matched. */
function routeOf(req: Request, context: Context): string {
  const splat = context.params?.['*']
  if (splat) return splat
  const { pathname } = new URL(req.url)
  return pathname
    .replace(/^\/api\/?/, '')
    .replace(/^\/\.netlify\/functions\/api\/?/, '')
}

export default async (req: Request, context: Context) => {
  const path = routeOf(req, context)
  const [head, param] = path.split('/')

  try {
    // ---------- Participant routes (invitation token = credential) ----------

    // GET /api/invite/:token → the decision + who was invited + any interview
    // already underway. This is what makes an invite work from a different
    // device, and what makes it RESUME on the same one.
    //
    // Only a `complete` interview closes the door. `invite.completedAt` marks
    // that the link was used (the dashboard counts open invites with it) — it
    // is deliberately NOT the immutability test, because an interview that was
    // submitted but whose report failed still belongs to the participant.
    if (req.method === 'GET' && head === 'invite' && param) {
      const invite = await resolveInvite(param)
      if (!invite) return json({ decision: 'unknown' })
      if (invite.status === 'disabled') return json({ decision: 'disabled' })
      const [person, interview] = await Promise.all([
        getPerson(invite.personId),
        getInterview(invite.personId) as Promise<Interview | null>,
      ])
      if (interview?.status === 'complete') return json({ decision: 'completed' })
      return json({ decision: 'accept', person, invite, interview })
    }

    // POST /api/checkpoint { token, interview } → durably store an interview
    // that is still in flight. This is the platform's durability guarantee:
    // every completed turn lands here before the participant is shown the next
    // question, so a refresh, a closed browser, a dropped network or a failed
    // AI turn costs them nothing they already answered.
    //
    // Authorised the same way /api/submit is: the participant's invitation, or
    // the Innovation Team's bearer for an internal test-run.
    if (req.method === 'POST' && head === 'checkpoint') {
      const { token, interview } = (await req.json()) as { token?: string; interview?: Interview }
      const invite = await resolveInvite(token ?? '')
      if (!invite && !isAdmin(req)) return json({ error: 'not authorised' }, 403)
      if (invite && invite.status === 'disabled') return json({ error: 'invitation is not active' }, 403)
      if (!interview?.personId) return json({ error: 'malformed checkpoint' }, 400)
      // An invitation may only checkpoint the interview it was issued for.
      if (invite && invite.personId !== interview.personId) return json({ error: 'not authorised' }, 403)

      const stored = (await getInterview(interview.personId)) as Interview | null

      // Immutability (requirement 7): a finished interview is a record, not a
      // draft. Say so with a status the client can act on rather than retry.
      if (stored?.status === 'complete') {
        return json({ error: 'interview is already complete', status: 'complete' }, 409)
      }
      // The report is being written server-side; the conversation is over and
      // a late checkpoint must not drag it back to in_progress. Not an error —
      // acknowledge it so the client stops retrying.
      if (stored?.status === 'generating') {
        return json({ ok: true, ignored: 'generating' })
      }
      // Monotonicity: a retry delayed behind a newer write must never clobber
      // it. Interviews stored before checkpointing existed have no revision.
      if (stored && (interview.revision ?? 0) <= (stored.revision ?? 0)) {
        return json({ ok: true, ignored: 'stale', revision: stored.revision ?? 0 })
      }

      await putInterview({ ...interview, status: 'in_progress', updatedAt: Date.now() })
      return json({ ok: true, revision: interview.revision ?? 0 })
    }

    // GET /api/interview/:token → the participant polls their own submission.
    if (req.method === 'GET' && head === 'interview' && param) {
      const invite = await resolveInvite(param)
      if (!invite) return json({ error: 'unknown invitation' }, 404)
      const interview = await getInterview(invite.personId)
      return json({ status: (interview as { status?: string } | null)?.status ?? 'not_started' })
    }

    // POST /api/submit  { token, interview, person } → store centrally, then
    // hand the report to the background function.
    if (req.method === 'POST' && head === 'submit') {
      const { token, interview, person } = await req.json()
      const invite = await resolveInvite(token)
      // Participants authenticate with the invitation; the Innovation Team's
      // own test-run has no token and authenticates as admin.
      if (!invite && !isAdmin(req)) return json({ error: 'invitation is not active' }, 403)
      if (invite && invite.status === 'disabled') return json({ error: 'invitation is not active' }, 403)

      // Enrich the roster from the conversation. An invitation carries only a
      // name and an email; the interview is what reveals someone's role, team
      // and location, so fill any field the Innovation Team left blank. Values
      // they have already entered win — discovery informs the roster, it does
      // not overwrite a human's correction.
      const existing = (await getPerson(interview.personId)) as Record<string, string> | null
      if (person) {
        await putPerson(existing
          ? {
              ...existing,
              designation: existing.designation || person.designation || '',
              state: existing.state || person.state || '',
              department: existing.department || person.department || '',
              phone: existing.phone || person.phone || '',
            } as { id: string }
          : person)
      }

      // Submitting closes the conversation. Bump past any revision the client
      // may still be retrying so a checkpoint in flight cannot reopen it.
      const storedInterview = (await getInterview(interview.personId)) as Interview | null
      if (storedInterview?.status === 'complete') {
        return json({ error: 'interview is already complete', status: 'complete' }, 409)
      }
      await putInterview({
        ...interview,
        status: 'generating',
        revision: Math.max(interview.revision ?? 0, storedInterview?.revision ?? 0) + 1,
        updatedAt: Date.now(),
        analysisError: null,
      })
      if (invite) await putInvite({ ...(invite as object), token, completedAt: Date.now() } as { token: string })

      // Fire-and-forget: the analysis exceeds this function's time budget.
      const origin = new URL(req.url).origin
      void fetch(`${origin}/.netlify/functions/analysis-background`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ personId: interview.personId }),
      }).catch(() => { /* the participant polls; a failure surfaces there */ })

      return json({ ok: true, status: 'generating' })
    }

    // POST /api/ai  { token?, action, payload } → proxy a short Claude call.
    // Participants never hold an API key; the server does.
    if (req.method === 'POST' && head === 'ai') {
      const body = await req.json()
      const authorised = isAdmin(req) || Boolean(await resolveInvite(body.token))
      if (!authorised) return json({ error: 'not authorised' }, 403)
      const { runTurn } = await import('./_ai.mts')
      return json(await runTurn(body))
    }

    // ---------- Innovation Team routes (server-verified bearer) ----------

    if (!isAdmin(req)) return json({ error: 'not authorised' }, 401)

    // GET /api/state → the whole pilot dataset. Tens of records; one round trip.
    if (req.method === 'GET' && head === 'state') {
      const [people, invites, interviews] = await Promise.all([
        allPeople(), allInvites(), allInterviews(),
      ])
      return json({ people, invites, interviews })
    }

    if (req.method === 'PUT' && head === 'person') {
      await putPerson(await req.json())
      return json({ ok: true })
    }

    if (req.method === 'DELETE' && head === 'person' && param) {
      await deletePerson(param)
      return json({ ok: true })
    }

    if (req.method === 'PUT' && head === 'invite') {
      await putInvite(await req.json())
      return json({ ok: true })
    }

    if (req.method === 'PUT' && head === 'interview') {
      await putInterview(await req.json())
      return json({ ok: true })
    }

    return json({ error: 'no such route' }, 404)
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'unexpected error' }, 500)
  }
}

export const config: Config = { path: '/api/*' }
