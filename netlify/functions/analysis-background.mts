// The report analysis. It runs here, not in the sync API, because a 16k-token
// structured generation takes ~40-90s — well past the synchronous function
// budget. Background functions get a long budget but answer 202 immediately,
// so the participant's browser polls GET /api/interview/:token.
//
// This is why the portal's copy — "This takes about a minute. You can leave
// this page and come back — nothing is lost" — is now literally true: the work
// happens server-side and the result lands in shared storage either way.

import type { Interview, Person } from '../../src/types.ts'
import { discoveredDepartments } from '../../src/org.ts'
import { simulatedAnalysis } from '../../src/engine/simulated.ts'
import { allInterviews, getInterview, getPerson, putInterview, putPerson } from './_store.mts'
import { runAnalysis } from './_ai.mts'

export default async (req: Request) => {
  const { personId } = await req.json()
  const interview = (await getInterview(personId)) as Interview | null
  if (!interview) return new Response('no such interview', { status: 404 })

  // Emergent org context: the offline analyst can only draw edges to teams
  // other interviews have already revealed.
  const everyone = await allInterviews<Interview>()
  const knownNames = discoveredDepartments(everyone).map((d) => d.name)

  let analysis: ReturnType<typeof simulatedAnalysis> | Awaited<ReturnType<typeof runAnalysis>>
  let mode: Interview['mode'] = 'live'
  try {
    analysis = await runAnalysis(interview)
  } catch {
    // Two engines, one contract. If the server cannot reach Claude, the
    // offline analyst still produces a report from the same facts — a
    // participant's twenty minutes must never end in a dead end.
    try {
      analysis = simulatedAnalysis(interview, knownNames)
      mode = 'simulated'
    } catch (err) {
      // The transcript and facts survive: a failed report is ours to retry,
      // not the participant's twenty minutes to redo. `analysis_failed` is a
      // resumable state, not a terminal one.
      await putInterview({
        ...interview,
        status: 'analysis_failed',
        analysisError: err instanceof Error ? err.message : 'The analysis could not be completed.',
        revision: (interview.revision ?? 0) + 1,
        updatedAt: Date.now(),
      })
      return new Response('analysis failed')
    }
  }

  await putInterview({
    ...interview,
    status: 'complete',
    // `mode` records which INTERVIEW engine held the conversation — a runtime
    // interview stays 'runtime' (the acceptance evidence for the migration).
    // The local `mode` variable only tracked which ANALYST wrote the report;
    // it must not clobber the engine identity. (Audit finding.)
    mode: interview.mode === 'runtime' ? 'runtime' : mode,
    completedAt: Date.now(),
    departmentName: analysis.departmentName,
    profile: analysis.profile,
    report: analysis.report,
    opportunities: analysis.opportunities,
    edges: analysis.edges,
    revision: (interview.revision ?? 0) + 1,
    updatedAt: Date.now(),
    analysisError: null,
  })

  // The organization is discovered, not declared: write the team the interview
  // revealed back onto the person record, so the roster learns from the
  // conversation rather than from an org chart.
  const person = (await getPerson(personId)) as Person | null
  if (person && analysis.departmentName && !person.department) {
    await putPerson({ ...person, department: analysis.departmentName })
  }

  // Milestone 1: every completed interview also yields an evidence envelope.
  // Fire-and-forget — extraction failure never blocks the report, and a missing
  // envelope is visible (and re-runnable) from the admin evidence routes.
  const origin = new URL(req.url).origin
  void fetch(`${origin}/.netlify/functions/evidence-background`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ personId }),
  }).catch(() => { /* re-runnable via POST /api/evidence/extract */ })

  return new Response('ok')
}
