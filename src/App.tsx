import { useState } from 'react'
import { StoreProvider, useStore } from './store'
import { PeopleScreen } from './screens/People'
import { Portal } from './screens/Portal'
import { ReportScreen } from './screens/Report'
import { Dashboard } from './screens/Dashboard'
import { GraphScreen } from './screens/Graph'
import { SettingsModal } from './screens/Settings'
import { InitiativeLabel, ModuleLabel, Wordmark } from './components/ui'

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

type Tab = 'dashboard' | 'people' | 'graph'

type Route =
  | { kind: 'portal'; inviteToken: string }
  | { kind: 'landing' }
  | { kind: 'innovation'; tab: Tab }

function parseRoute(): Route {
  const h = window.location.hash.replace(/^#/, '')
  // Dashboard is the landing page after admin login.
  if (h === 'innovation' || h === 'innovation/dashboard') return { kind: 'innovation', tab: 'dashboard' }
  if (h === 'innovation/people') return { kind: 'innovation', tab: 'people' }
  if (h === 'innovation/graph') return { kind: 'innovation', tab: 'graph' }
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-050 px-6 text-center">
      <Wordmark />
      <div className="mt-2"><InitiativeLabel /></div>
      <h1 className="mt-6 font-display text-display2 font-heavy text-ink">This conversation is by invitation.</h1>
      <p className="mt-4 max-w-sm text-bodySmall text-neutral-700">
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
    <div className="flex min-h-screen items-center justify-center bg-neutral-050 px-6">
      <div className="card w-full max-w-sm p-6">
        <Wordmark />
        <div className="mt-2"><InitiativeLabel /></div>
        <h1 className="mt-6 font-display text-heading font-heavy text-ink">Innovation Dashboard</h1>
        <p className="mt-2 text-bodySmall text-neutral-700">Restricted to the Innovation Team and Founders.</p>
        <form
          className="mt-6"
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
            className="input font-sans"
            autoFocus
          />
          {wrong && <p className="mt-2 text-label text-error">That code isn't right.</p>}
          <button type="submit" className="btn-primary mt-4 w-full">Enter</button>
        </form>
      </div>
    </div>
  )
}

// ---------- Innovation shell (everything already built) ----------

interface View {
  tab: Tab
  personId: string | null // when set, we're inside a person's interview or report
}

function InnovationShell({ initialTab }: { initialTab: Tab }) {
  const { interviews, resetInterview } = useStore()
  const [view, setView] = useState<View>({ tab: initialTab, personId: null })
  const [showSettings, setShowSettings] = useState(false)

  const goTab = (tab: Tab) => {
    window.location.hash = tab === 'dashboard' ? 'innovation' : `innovation/${tab}`
    setView({ tab, personId: null })
  }
  const openPerson = (personId: string) => setView((v) => ({ ...v, personId }))
  const closePerson = () => setView((v) => ({ ...v, personId: null }))

  let content
  if (view.personId) {
    const personId = view.personId
    const iv = interviews[personId]
    if (iv?.status === 'complete') {
      content = (
        <ReportScreen
          personId={personId}
          onExit={closePerson}
          onRestart={() => { resetInterview(personId); closePerson() }}
        />
      )
    } else {
      // Internal test-run of the participant experience, inside the shell
      content = (
        <Portal
          presetPersonId={personId}
          internal
          onExit={closePerson}
          onFinished={() => { /* status flips to complete; this view now renders the report */ }}
        />
      )
    }
  } else if (view.tab === 'people') {
    content = <PeopleScreen onOpenPerson={openPerson} />
  } else if (view.tab === 'graph') {
    content = <GraphScreen onOpenPerson={openPerson} />
  } else {
    content = <Dashboard onOpenPerson={openPerson} />
  }

  return (
    <div className="min-h-screen">
      <nav className="sticky top-0 z-40 border-b border-neutral-150 bg-neutral-050/90 backdrop-blur" aria-label="Primary">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex shrink-0 items-center gap-4">
            <button onClick={() => goTab('dashboard')} aria-label="CYRA Discovery home">
              <Wordmark />
            </button>
            <ModuleLabel>Discovery</ModuleLabel>
          </div>
          <div className="flex items-center gap-2">
            <TabButton active={view.tab === 'dashboard' && !view.personId} onClick={() => goTab('dashboard')}>Dashboard</TabButton>
            <TabButton active={view.tab === 'people' && !view.personId} onClick={() => goTab('people')}>People</TabButton>
            <TabButton active={view.tab === 'graph' && !view.personId} onClick={() => goTab('graph')}>Graph</TabButton>
            <button
              onClick={() => setShowSettings(true)}
              className="ml-2 p-2 text-neutral-700 transition-colors hover:bg-neutral-150 hover:text-ink"
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
      className={` px-4 py-2 text-bodySmall font-medium transition-colors ${
 active ? 'bg-paper text-ink ' : 'text-neutral-700 hover:text-ink'
 }`}
      aria-current={active ? 'page' : undefined}
    >
      {children}
    </button>
  )
}
