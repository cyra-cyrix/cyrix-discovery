import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Interview, Invite, Person, Settings } from './types'

// v4: people-first discovery model — people are the primary entity; interviews
// are keyed by person; the org structure emerges from interviews. No seed data.
const STORAGE_KEY = 'cyrix-discovery-v4'
const ARCHIVE_KEY = 'cyrix-discovery-archive'

/** Preserve a replaced interview so no discovery is ever silently lost. */
export function archiveInterview(interview: Interview): void {
  try {
    const raw = localStorage.getItem(ARCHIVE_KEY)
    const list = raw ? (JSON.parse(raw) as Interview[]) : []
    list.push(interview)
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify(list))
  } catch {
    // archive is best-effort
  }
}

interface PersistedState {
  people: Record<string, Person> // keyed by person id
  interviews: Record<string, Interview> // keyed by person id
  invites: Record<string, Invite> // keyed by token
  settings: Settings
}

interface StoreValue extends PersistedState {
  upsertPerson: (person: Person) => void
  removePerson: (personId: string) => void
  setInterview: (personId: string, interview: Interview) => void
  updateInterview: (personId: string, patch: (prev: Interview) => Interview) => void
  resetInterview: (personId: string) => void
  upsertInvite: (invite: Invite) => void
  setSettings: (s: Settings) => void
  resetAll: () => void
}

const defaultState = (): PersistedState => ({
  people: {},
  interviews: {},
  invites: {},
  settings: { apiKey: '', model: 'claude-opus-4-8' },
})

function load(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultState()
    const parsed = JSON.parse(raw) as Partial<PersistedState>
    if (!parsed.interviews || !parsed.settings) return defaultState()
    return { ...defaultState(), ...parsed, people: parsed.people ?? {}, invites: parsed.invites ?? {} }
  } catch {
    return defaultState()
  }
}

const StoreContext = createContext<StoreValue | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(load)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // storage full or unavailable — keep running in memory
    }
  }, [state])

  const upsertPerson = useCallback((person: Person) => {
    setState((s) => ({ ...s, people: { ...s.people, [person.id]: person } }))
  }, [])

  const removePerson = useCallback((personId: string) => {
    setState((s) => {
      const people = { ...s.people }
      delete people[personId]
      const interviews = { ...s.interviews }
      const existing = interviews[personId]
      if (existing) {
        archiveInterview(existing)
        delete interviews[personId]
      }
      return { ...s, people, interviews }
    })
  }, [])

  const setInterview = useCallback((personId: string, interview: Interview) => {
    setState((s) => ({ ...s, interviews: { ...s.interviews, [personId]: interview } }))
  }, [])

  const updateInterview = useCallback((personId: string, patch: (prev: Interview) => Interview) => {
    setState((s) => {
      const prev = s.interviews[personId]
      if (!prev) return s
      return { ...s, interviews: { ...s.interviews, [personId]: patch(prev) } }
    })
  }, [])

  const resetInterview = useCallback((personId: string) => {
    setState((s) => {
      const interviews = { ...s.interviews }
      const existing = interviews[personId]
      if (existing) archiveInterview(existing)
      delete interviews[personId]
      return { ...s, interviews }
    })
  }, [])

  const upsertInvite = useCallback((invite: Invite) => {
    setState((s) => ({ ...s, invites: { ...s.invites, [invite.token]: invite } }))
  }, [])

  const setSettings = useCallback((settings: Settings) => {
    setState((s) => ({ ...s, settings }))
  }, [])

  const resetAll = useCallback(() => {
    setState((s) => {
      for (const iv of Object.values(s.interviews)) archiveInterview(iv)
      return { ...defaultState(), settings: s.settings }
    })
  }, [])

  const value = useMemo<StoreValue>(
    () => ({ ...state, upsertPerson, removePerson, setInterview, updateInterview, resetInterview, upsertInvite, setSettings, resetAll }),
    [state, upsertPerson, removePerson, setInterview, updateInterview, resetInterview, upsertInvite, setSettings, resetAll],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore outside StoreProvider')
  return ctx
}
