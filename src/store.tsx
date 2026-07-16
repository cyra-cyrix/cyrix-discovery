import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Interview, Invite, Settings } from './types'

// v3: first internal rollout — the platform starts clean and earns every
// insight from real interviews. No seeded data.
const STORAGE_KEY = 'cyrix-discovery-v3'
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
  interviews: Record<string, Interview>
  invites: Record<string, Invite> // keyed by token
  settings: Settings
}

interface StoreValue extends PersistedState {
  setInterview: (deptId: string, interview: Interview) => void
  updateInterview: (deptId: string, patch: (prev: Interview) => Interview) => void
  resetInterview: (deptId: string) => void
  upsertInvite: (invite: Invite) => void
  setSettings: (s: Settings) => void
  resetAll: () => void
}

const defaultState = (): PersistedState => ({
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
    return { ...defaultState(), ...parsed, invites: parsed.invites ?? {} }
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

  const setInterview = useCallback((deptId: string, interview: Interview) => {
    setState((s) => ({ ...s, interviews: { ...s.interviews, [deptId]: interview } }))
  }, [])

  const updateInterview = useCallback((deptId: string, patch: (prev: Interview) => Interview) => {
    setState((s) => {
      const prev = s.interviews[deptId]
      if (!prev) return s
      return { ...s, interviews: { ...s.interviews, [deptId]: patch(prev) } }
    })
  }, [])

  const resetInterview = useCallback((deptId: string) => {
    setState((s) => {
      const interviews = { ...s.interviews }
      const existing = interviews[deptId]
      if (existing) archiveInterview(existing)
      delete interviews[deptId]
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
    () => ({ ...state, setInterview, updateInterview, resetInterview, upsertInvite, setSettings, resetAll }),
    [state, setInterview, updateInterview, resetInterview, upsertInvite, setSettings, resetAll],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore outside StoreProvider')
  return ctx
}
