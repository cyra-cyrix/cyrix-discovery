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

    // GET /api/invite/:token → the decision + who was invited.
    // This is what makes an invite work from a different device.
    if (req.method === 'GET' && head === 'invite' && param) {
      const invite = await resolveInvite(param)
      if (!invite) return json({ decision: 'unknown' })
      if (invite.status === 'disabled') return json({ decision: 'disabled' })
      if (invite.completedAt) return json({ decision: 'completed' })
      const person = await getPerson(invite.personId)
      return json({ decision: 'accept', person, invite })
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

      // The person may not exist centrally yet (a participant can arrive
      // without a roster record — personFromContext).
      const existing = await getPerson(interview.personId)
      if (!existing && person) await putPerson(person)

      await putInterview({ ...interview, status: 'generating' })
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
