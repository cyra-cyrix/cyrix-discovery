import { useState } from 'react'
import { StoreProvider, useStore } from './store'
import { Home } from './screens/Home'
import { Portal } from './screens/Portal'
import { ReportScreen } from './screens/Report'
import { Dashboard } from './screens/Dashboard'
import { GraphScreen } from './screens/Graph'
import { InvitesScreen } from './screens/Invites'
import { SettingsModal } from './screens/Settings'
import { Wordmark } from './components/ui'

// ---------------------------------------------------------------------------
// Two experiences, split by URL:
//   #invite/<token>    → Discovery Conversation Portal (participants; the token
//                        identifies the invitation only — never the department)
//   #innovation[/tab]  → Innovation Dashboard (Innovation Team, gated)
//   (root)             → invitation-required notice
// Participants never see navigation or any internal surface.
// ---------------------------------------------------------------------------

const ACCESS_KEY = 'cyrix-innovation-access'
const ACCESS_CODE = 'cyrix2026' // front-end gate for the internal deployment; move behind real auth with the first backend

type Tab = 'home' | 'dashboard' | 'graph' | 'invites'

type Route =
  | { kind: 'portal'; inviteToken: string }
  | { kind: 'landing' }
  | { kind: 'innovation'; tab: Tab }

function parseRoute(): Route {
  const h = window.location.hash.replace(/^#/, '')
  if (h === 'innovation' || h === 'innovation/home') return { kind: 'innovation', tab: 'home' }
  if (h === 'innovation/dashboard') return { kind: 'innovation', tab: 'dashboard' }
  if (h === 'innovation/graph') return { kind: 'innovation', tab: 'graph' }
  if (h === 'innovation/invites') return { kind: 'innovation', tab: 'invites' }
  if (h.startsWith('invite/')) return { kind: 'portal', inviteToken: h.slice('invite/'.length) }
  return { kind: 'landing' }
}

export default function App() {
  const [route] = useState<Route>(parseRoute)
  return (
    <StoreProvider>
      {route.kind === 'portal' && <Portal inviteToken={route.inviteToken} />}
      {route.kind === 'landing' && <InviteRequired />}
      {route.kind === 'innovation' && <GatedInnovation initialTab={route.tab} />}
    </StoreProvider>
  )
}

function InviteRequired() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-porcelain-100 px-6 text-center">
      <Wordmark />
      <h1 className="mt-6 font-display text-2xl font-bold text-carbon">This conversation is by invitation.</h1>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate">
        Please use the personal invitation link you received. If you don't have one, the Cyrix Innovation Team
        will be happy to send it.
      </p>
    </div>
  )
}

// ---------- Access gate ----------

function GatedInnovation({ initialTab }: { initialTab: Tab }) {
  const [granted, setGranted] = useState(() => localStorage.getItem(ACCESS_KEY) === 'granted')
  if (!granted) {
    return <AccessGate onGranted={() => { localStorage.setItem(ACCESS_KEY, 'granted'); setGranted(true) }} />
  }
  return <InnovationShell initialTab={initialTab} />
}

function AccessGate({ onGranted }: { onGranted: () => void }) {
  const [code, setCode] = useState('')
  const [wrong, setWrong] = useState(false)
  return (
    <div className="flex min-h-screen items-center justify-center bg-porcelain-100 px-6">
      <div className="card w-full max-w-sm p-6">
        <Wordmark />
        <h1 className="mt-5 font-display text-lg font-bold text-carbon">Innovation Dashboard</h1>
        <p className="mt-1 text-sm text-slate">Restricted to the Innovation Team and Founders.</p>
        <form
          className="mt-5"
          onSubmit={(e) => {
            e.preventDefault()
            if (code === ACCESS_CODE) onGranted()
            else setWrong(true)
          }}
        >
          <input
            type="password"
            value={code}
            onChange={(e) => { setCode(e.target.value); setWrong(false) }}
            placeholder="Access code"
            className="input font-mono"
            autoFocus
          />
          {wrong && <p className="mt-2 text-xs text-signal-600">That code isn't right.</p>}
          <button type="submit" className="btn-primary mt-4 w-full">Enter</button>
        </form>
      </div>
    </div>
  )
}

// ---------- Innovation shell (everything already built) ----------

interface View {
  tab: Tab
  deptId: string | null // when set, we're inside a department (conversation or report)
}

function InnovationShell({ initialTab }: { initialTab: Tab }) {
  const { interviews, updateInterview } = useStore()
  const [view, setView] = useState<View>({ tab: initialTab, deptId: null })
  const [showSettings, setShowSettings] = useState(false)

  const goTab = (tab: Tab) => {
    window.location.hash = tab === 'home' ? 'innovation' : `innovation/${tab}`
    setView({ tab, deptId: null })
  }
  const openDept = (deptId: string) => setView((v) => ({ ...v, deptId }))
  const closeDept = () => setView((v) => ({ ...v, deptId: null }))

  const restartInterview = (deptId: string) => {
    updateInterview(deptId, (p) => ({
      ...p,
      status: 'not_started',
      messages: [],
      facts: [],
    }))
  }

  let content
  if (view.deptId) {
    const deptId = view.deptId
    const iv = interviews[deptId]
    if (iv?.status === 'complete') {
      content = (
        <ReportScreen
          deptId={deptId}
          onExit={closeDept}
          onRestart={() => restartInterview(deptId)}
        />
      )
    } else {
      // Internal test-run of the participant experience, inside the shell
      content = (
        <Portal
          presetDeptId={deptId}
          internal
          onExit={closeDept}
          onFinished={() => { /* status flips to complete; this view now renders the report */ }}
        />
      )
    }
  } else if (view.tab === 'dashboard') {
    content = <Dashboard onOpenDept={openDept} />
  } else if (view.tab === 'graph') {
    content = <GraphScreen onOpenDept={openDept} />
  } else if (view.tab === 'invites') {
    content = <InvitesScreen />
  } else {
    content = <Home onOpenDept={openDept} />
  }

  return (
    <div className="min-h-screen">
      <nav className="sticky top-0 z-40 border-b border-porcelain-200 bg-porcelain-100/90 backdrop-blur" aria-label="Primary">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <button onClick={() => goTab('home')} className="shrink-0" aria-label="Innovation dashboard home">
            <Wordmark />
          </button>
          <div className="flex items-center gap-1">
            <TabButton active={view.tab === 'home' && !view.deptId} onClick={() => goTab('home')}>Departments</TabButton>
            <TabButton active={view.tab === 'dashboard' && !view.deptId} onClick={() => goTab('dashboard')}>Dashboard</TabButton>
            <TabButton active={view.tab === 'graph' && !view.deptId} onClick={() => goTab('graph')}>Graph</TabButton>
            <TabButton active={view.tab === 'invites' && !view.deptId} onClick={() => goTab('invites')}>Invites</TabButton>
            <button
              onClick={() => setShowSettings(true)}
              className="ml-1 rounded-lg p-2 text-slate transition-colors hover:bg-porcelain-200 hover:text-carbon"
              aria-label="Settings"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>
        </div>
      </nav>
      {content}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  )
}

function TabButton({ active, onClick, children }: {
  active: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? 'bg-white text-petrol-700 shadow-card' : 'text-slate hover:text-carbon'
      }`}
      aria-current={active ? 'page' : undefined}
    >
      {children}
    </button>
  )
}
