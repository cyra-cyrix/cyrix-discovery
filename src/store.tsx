import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Interview, Invite, Person, Settings } from './types'
import * as api from './api'

// Shared persistence. The domain model is unchanged — people (primary),
// interviews (keyed by person), invites (keyed by token) — but it now lives
// centrally instead of in one browser, so a link works on any device and the
// Innovation Dashboard sees interviews the moment they land.
//
// `settings` remains browser-local: a per-operator UI preference, not
// organizational data. The Anthropic key is no longer here at all — it is a
// server env var (netlify/functions/_ai.mts).
//
// INTERVIEW DURABILITY (platform requirement, not an enhancement)
// ---------------------------------------------------------------
// Every mutation to an interview is checkpointed to shared storage before the
// participant is shown the next question. Two tiers, in this order:
//
//   1. A write-ahead buffer in localStorage (the outbox). Written FIRST, so a
//      turn survives even if the tab dies before the request completes.
//   2. POST /api/checkpoint. On acknowledgement the outbox entry is dropped.
//
// The outbox is the ONE exception to "no domain data in localStorage", and a
// deliberate one: without it, a participant who loses their network and then
// closes the tab loses the turn they already answered. It holds data only
// while a write is unacknowledged — never at rest.
//
// Each checkpoint is a FULL snapshot, so only the newest per person is ever
// needed: a later snapshot supersedes an earlier one entirely. That is why the
// outbox is a map keyed by personId and not a queue — there is no ordering to
// get wrong, and no partial replay to reason about.

const SETTINGS_KEY = 'cyra-settings'
const OUTBOX_KEY = 'cyra-checkpoint-outbox'
const POLL_MS = 15000
const RETRY_MS = 5000

interface Pending {
  token: string | null
  interview: Interview
}
type Outbox = Record<string, Pending>

function readOutbox(): Outbox {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY)
    return raw ? (JSON.parse(raw) as Outbox) : {}
  } catch {
    return {}
  }
}

function writeOutbox(next: Outbox) {
  try {
    if (Object.keys(next).length === 0) localStorage.removeItem(OUTBOX_KEY)
    else localStorage.setItem(OUTBOX_KEY, JSON.stringify(next))
  } catch { /* quota or private mode: the network tier still applies */ }
}

/** Remove a buffered checkpoint. With `revision`, only if nothing newer was
 *  queued while the request was in flight; without it, unconditionally. */
function dropPending(personId: string, revision?: number) {
  const latest = readOutbox()
  const entry = latest[personId]
  if (!entry) return
  if (revision !== undefined && entry.interview.revision !== revision) return
  delete latest[personId]
  writeOutbox(latest)
}

interface StoreValue {
  people: Record<string, Person>
  interviews: Record<string, Interview>
  invites: Record<string, Invite>
  settings: Settings
  /** null until the first load resolves; surfaces a real backend error. */
  loadError: string | null
  loading: boolean
  refresh: () => Promise<void>
  upsertPerson: (person: Person) => Promise<void>
  removePerson: (personId: string) => Promise<void>
  upsertInvite: (invite: Invite) => Promise<void>
  /** Seed an interview locally and checkpoint it. `token` is the participant's
   *  invitation; omit it on the internal test-run (admin bearer is used). */
  setInterview: (personId: string, interview: Interview, token?: string | null) => Promise<void>
  updateInterview: (personId: string, patch: (prev: Interview) => Interview, token?: string | null) => Promise<void>
  resetInterview: (personId: string) => Promise<void>
  /** Adopt an interview the server already holds, without checkpointing it
   *  back. Used by the portal when an invitation resolves to a resumable
   *  interview — the server's copy is already the source of truth. */
  adoptInterview: (personId: string, interview: Interview) => void
  setSettings: (s: Settings) => void
}

const defaultSettings = (): Settings => ({ apiKey: '', model: 'claude-opus-4-8' })

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    return raw ? { ...defaultSettings(), ...JSON.parse(raw) } : defaultSettings()
  } catch {
    return defaultSettings()
  }
}

const StoreContext = createContext<StoreValue | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [people, setPeople] = useState<Record<string, Person>>({})
  const [interviews, setInterviews] = useState<Record<string, Interview>>({})
  const [invites, setInvites] = useState<Record<string, Invite>>({})
  const [settings, setSettingsState] = useState<Settings>(loadSettings)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const mounted = useRef(true)
  // Mirrors `interviews` synchronously. React state batches, but two turns can
  // be checkpointed back to back — reading state would race and stamp the same
  // revision twice, which the server would reject as stale.
  const interviewsRef = useRef<Record<string, Interview>>({})
  const flushing = useRef(false)

  // Re-arm on every mount. StrictMode mounts, unmounts and remounts in
  // development: without the reset the flag stays false after the first
  // cleanup, and every fetch result is discarded as "unmounted".
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  useEffect(() => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) } catch { /* non-fatal */ }
  }, [settings])

  const refresh = useCallback(async () => {
    // Only the Innovation Team reads the whole dataset; participants never do.
    if (!api.getAdminToken()) { setLoading(false); return }
    try {
      const state = await api.fetchState()
      if (!mounted.current) return
      setPeople(state.people)
      interviewsRef.current = state.interviews
      setInterviews(state.interviews)
      setInvites(state.invites)
      setLoadError(null)
    } catch (e) {
      if (!mounted.current) return
      setLoadError(e instanceof Error ? e.message : 'Could not reach the server.')
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  // "The dashboard immediately reflects completed interviews" — a background
  // analysis finishes server-side, so the client polls while it is watching.
  useEffect(() => {
    if (!api.getAdminToken()) return
    const tick = () => { if (document.visibilityState === 'visible') void refresh() }
    const id = setInterval(tick, POLL_MS)
    document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick) }
  }, [refresh])

  // Each mutation writes through to shared storage, then updates locally so the
  // UI stays responsive. A failed write surfaces rather than silently diverging.
  const upsertPerson = useCallback(async (person: Person) => {
    await api.putPerson(person)
    setPeople((p) => ({ ...p, [person.id]: person }))
  }, [])

  const removePerson = useCallback(async (personId: string) => {
    await api.deletePerson(personId)
    dropPending(personId)
    setPeople((p) => { const next = { ...p }; delete next[personId]; return next })
    const next = { ...interviewsRef.current }
    delete next[personId]
    interviewsRef.current = next
    setInterviews(next)
  }, [])

  const upsertInvite = useCallback(async (invite: Invite) => {
    await api.putInvite(invite)
    setInvites((i) => ({ ...i, [invite.token]: invite }))
  }, [])

  // ---------- Interview checkpointing ----------

  /** Drain the outbox. Safe to call at any time; never throws. A write that
   *  cannot land stays buffered and is retried — that is the durability
   *  guarantee, so failures here are expected, not exceptional. */
  const flush = useCallback(async () => {
    if (flushing.current) return
    flushing.current = true
    try {
      for (const [personId, entry] of Object.entries(readOutbox())) {
        try {
          const ack = await api.checkpointInterview(entry.token, entry.interview)
          // `ignored` means the server deliberately declined the write (a newer
          // revision is stored, or the conversation is over). Nothing to retry.
          void ack.ignored
          dropPending(personId, entry.interview.revision)
        } catch (e) {
          // Terminal rejections: 409 the interview is complete and immutable,
          // 401/403 this client may never write it. Retrying any of them
          // forever would leak the buffer. Anything else — offline, 5xx, a
          // function timeout — keeps its place and is tried again.
          const terminal = e instanceof api.ApiError && [401, 403, 409].includes(e.status)
          if (terminal) dropPending(personId, entry.interview.revision)
        }
      }
    } finally {
      flushing.current = false
    }
  }, [])

  /** Buffer, then send. The order matters: if the tab dies between the two,
   *  the turn is already on disk and flushes on the next load. */
  const checkpoint = useCallback(async (personId: string, interview: Interview, token: string | null) => {
    const outbox = readOutbox()
    outbox[personId] = { token, interview }
    writeOutbox(outbox)
    await flush()
  }, [flush])

  const applyLocal = useCallback((personId: string, next: Interview) => {
    interviewsRef.current = { ...interviewsRef.current, [personId]: next }
    setInterviews(interviewsRef.current)
  }, [])

  const setInterview = useCallback(async (personId: string, interview: Interview, token: string | null = null) => {
    const prev = interviewsRef.current[personId]
    const next: Interview = {
      ...interview,
      revision: Math.max(interview.revision ?? 0, prev?.revision ?? 0) + 1,
      updatedAt: Date.now(),
    }
    applyLocal(personId, next)
    await checkpoint(personId, next, token)
  }, [applyLocal, checkpoint])

  const updateInterview = useCallback(async (personId: string, patch: (prev: Interview) => Interview, token: string | null = null) => {
    const current = interviewsRef.current[personId]
    if (!current) return
    const next: Interview = {
      ...patch(current),
      revision: (current.revision ?? 0) + 1,
      updatedAt: Date.now(),
    }
    applyLocal(personId, next)
    await checkpoint(personId, next, token)
  }, [applyLocal, checkpoint])

  const adoptInterview = useCallback((personId: string, interview: Interview) => {
    applyLocal(personId, interview)
  }, [applyLocal])

  const resetInterview = useCallback(async (personId: string) => {
    const current = interviewsRef.current[personId]
    if (current) await api.putInterview({ ...current, status: 'not_started', messages: [], facts: [], revision: (current.revision ?? 0) + 1, updatedAt: Date.now(), analysisError: null })
    dropPending(personId)
    const next = { ...interviewsRef.current }
    delete next[personId]
    interviewsRef.current = next
    setInterviews(next)
  }, [])

  // Drain anything a previous session left behind, then keep retrying while
  // the tab lives. This is what turns "the network came back" and "they
  // reopened the link" into recovered answers rather than lost ones.
  useEffect(() => {
    void flush()
    const id = setInterval(() => { if (navigator.onLine) void flush() }, RETRY_MS)
    const onOnline = () => { void flush() }
    window.addEventListener('online', onOnline)
    return () => { clearInterval(id); window.removeEventListener('online', onOnline) }
  }, [flush])

  // A closing tab does not wait for fetch. sendBeacon does — the request is
  // handed to the browser and survives the page. The checkpoint route takes
  // its credential in the body, so no Authorization header is needed and a
  // beacon can carry it; the outbox still covers the case where it fails.
  useEffect(() => {
    const onLeave = () => {
      for (const entry of Object.values(readOutbox())) {
        if (!entry.token) continue // internal test-run needs a bearer; skip
        try {
          navigator.sendBeacon(
            '/api/checkpoint',
            new Blob([JSON.stringify({ token: entry.token, interview: entry.interview })],
              { type: 'application/json' }),
          )
        } catch { /* best effort; the outbox retries on next load */ }
      }
    }
    window.addEventListener('pagehide', onLeave)
    return () => window.removeEventListener('pagehide', onLeave)
  }, [])

  const setSettings = useCallback((s: Settings) => setSettingsState(s), [])

  const value = useMemo<StoreValue>(() => ({
    people, interviews, invites, settings, loadError, loading,
    refresh, upsertPerson, removePerson, upsertInvite,
    setInterview, updateInterview, resetInterview, adoptInterview, setSettings,
  }), [people, interviews, invites, settings, loadError, loading, refresh,
       upsertPerson, removePerson, upsertInvite, setInterview, updateInterview,
       resetInterview, adoptInterview, setSettings])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore outside StoreProvider')
  return ctx
}
