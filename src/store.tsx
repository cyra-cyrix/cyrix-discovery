import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Interview, Invite, Person, Settings } from './types'
import * as api from './api'

// Shared persistence. The domain model is unchanged — people (primary),
// interviews (keyed by person), invites (keyed by token) — but it now lives
// centrally instead of in one browser, so a link works on any device and the
// Innovation Dashboard sees interviews the moment they land.
//
// Only `settings` remains browser-local: it is a per-operator UI preference,
// not organizational data. The Anthropic key is no longer here at all — it is
// a server env var (netlify/functions/_ai.mts).

const SETTINGS_KEY = 'cyra-settings'
const POLL_MS = 15000

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
  setInterview: (personId: string, interview: Interview) => Promise<void>
  updateInterview: (personId: string, patch: (prev: Interview) => Interview) => Promise<void>
  resetInterview: (personId: string) => Promise<void>
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

  useEffect(() => () => { mounted.current = false }, [])

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
    setPeople((p) => { const next = { ...p }; delete next[personId]; return next })
    setInterviews((i) => { const next = { ...i }; delete next[personId]; return next })
  }, [])

  const upsertInvite = useCallback(async (invite: Invite) => {
    await api.putInvite(invite)
    setInvites((i) => ({ ...i, [invite.token]: invite }))
  }, [])

  const setInterview = useCallback(async (personId: string, interview: Interview) => {
    setInterviews((i) => ({ ...i, [personId]: interview }))
  }, [])

  const updateInterview = useCallback(async (personId: string, patch: (prev: Interview) => Interview) => {
    setInterviews((prev) => {
      const current = prev[personId]
      if (!current) return prev
      return { ...prev, [personId]: patch(current) }
    })
  }, [])

  const resetInterview = useCallback(async (personId: string) => {
    const current = interviews[personId]
    if (current) await api.putInterview({ ...current, status: 'not_started', messages: [], facts: [] })
    setInterviews((i) => { const next = { ...i }; delete next[personId]; return next })
  }, [interviews])

  const setSettings = useCallback((s: Settings) => setSettingsState(s), [])

  const value = useMemo<StoreValue>(() => ({
    people, interviews, invites, settings, loadError, loading,
    refresh, upsertPerson, removePerson, upsertInvite,
    setInterview, updateInterview, resetInterview, setSettings,
  }), [people, interviews, invites, settings, loadError, loading, refresh,
       upsertPerson, removePerson, upsertInvite, setInterview, updateInterview,
       resetInterview, setSettings])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore outside StoreProvider')
  return ctx
}
