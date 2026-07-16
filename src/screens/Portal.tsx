import { useEffect, useRef, useState } from 'react'
import { DEPARTMENTS, deptById } from '../data/departments'
import { archiveInterview, useStore } from '../store'
import type { ChatMessage, Interview, ParticipantContext } from '../types'
import { newInterview } from '../types'
import { liveAnalysis, liveOpening, liveTurn } from '../engine/claude'
import { detectSystems, simulatedAnalysis, simulatedOpening, simulatedTurn } from '../engine/simulated'
import { lookupDecision } from '../invites'
import { PulseTrace, Wordmark } from '../components/ui'

// ---------------------------------------------------------------------------
// The Discovery Conversation Portal — the only surface participants ever see.
// Welcome → Basic context → Conversation (voice or text) → "What I understood"
// → Submit → Thank you. No navigation, no internal information.
//
// Participants arrive via a unique invitation token (#invite/<token>). The
// token identifies the invitation only — the department is always asked in the
// context form, never taken from the URL.
// ---------------------------------------------------------------------------

type Step = 'welcome' | 'context' | 'conversation' | 'summary' | 'generating' | 'done'

let idCounter = 0
const nextId = () => `p${Date.now()}-${idCounter++}`

// Minimal typing for the Web Speech API (not in lib.dom for all targets)
type AnyCtor = new () => any
function speechCtor(): AnyCtor | null {
  const w = window as unknown as Record<string, unknown>
  return (w.SpeechRecognition as AnyCtor) ?? (w.webkitSpeechRecognition as AnyCtor) ?? null
}

export function Portal({ inviteToken = null, presetDeptId = null, internal = false, onFinished, onExit }: {
  inviteToken?: string | null // participant path — unique invitation token from the URL
  presetDeptId?: string | null // internal test-run path only
  internal?: boolean
  onFinished?: (deptId: string) => void
  onExit?: () => void
}) {
  const store = useStore()
  const live = Boolean(store.settings.apiKey)

  const [step, setStep] = useState<Step>('welcome')
  const [deptId, setDeptId] = useState<string | null>(presetDeptId)
  const [voiceMode, setVoiceMode] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const interview = deptId ? store.interviews[deptId] : undefined
  const dept = deptId ? deptById(deptId) : null

  // Invitation gate (participant path only). Validation lives in invites.ts —
  // the backend seam — so this component never needs to change. Decided once
  // at entry: completing the interview must not flip the session into the
  // "already completed" notice before the thank-you screen.
  const [decision] = useState(() =>
    !internal && inviteToken !== null ? lookupDecision(inviteToken, store.invites) : 'accept',
  )
  if (decision !== 'accept') {
    return <InviteNotice decision={decision} />
  }

  // Resume: a reload mid-conversation finds the in-progress interview by token.
  const resumable = !internal && inviteToken
    ? Object.values(store.interviews).find((i) => i.inviteToken === inviteToken && i.status === 'in_progress' && i.participant)
    : presetDeptId && interview?.status === 'in_progress' && interview.participant
      ? interview
      : undefined

  // ---------- flow transitions ----------

  async function startConversation(ctx: ParticipantContext, chosenDeptId: string, useVoice: boolean) {
    setDeptId(chosenDeptId)
    setVoiceMode(useVoice)
    setError(null)

    const existing = store.interviews[chosenDeptId]
    if (existing && existing.status !== 'not_started') archiveInterview(existing)

    const mode = live ? 'live' : 'simulated'
    const iv = newInterview(chosenDeptId, mode, ctx, internal ? null : inviteToken)
    store.setInterview(chosenDeptId, iv)
    setStep('conversation')

    const chosenDept = deptById(chosenDeptId)
    if (mode === 'simulated') {
      store.updateInterview(chosenDeptId, (p) => ({
        ...p,
        messages: [{ id: nextId(), role: 'ai', text: simulatedOpening(ctx) }],
      }))
    } else {
      try {
        const opening = await liveOpening(store.settings.apiKey, store.settings.model, chosenDept, store.interviews, ctx)
        store.updateInterview(chosenDeptId, (p) => ({
          ...p,
          messages: [{ id: nextId(), role: 'ai', text: opening }],
        }))
      } catch {
        // fall back silently — the conversation must never dead-end for a participant
        store.updateInterview(chosenDeptId, (p) => ({
          ...p,
          mode: 'simulated',
          messages: [{ id: nextId(), role: 'ai', text: simulatedOpening(ctx) }],
        }))
      }
    }
  }

  async function submit() {
    if (!interview || !dept || !deptId) return
    setStep('generating')
    setError(null)
    store.updateInterview(deptId, (p) => ({ ...p, status: 'generating' }))
    try {
      const current = { ...interview, status: 'generating' as const }
      const analysis = interview.mode === 'live'
        ? await liveAnalysis(store.settings.apiKey, store.settings.model, dept, current)
        : simulatedAnalysis(dept, current)
      store.updateInterview(deptId, (p) => ({
        ...p,
        status: 'complete',
        completedAt: Date.now(),
        profile: analysis.profile,
        report: analysis.report,
        opportunities: analysis.opportunities,
        edges: analysis.edges,
      }))
      // Close out the invitation this conversation was started from.
      if (inviteToken) {
        const invite = store.invites[inviteToken]
        if (invite) store.upsertInvite({ ...invite, completedAt: Date.now() })
      }
      if (internal && onFinished) onFinished(deptId)
      else setStep('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try submitting again.')
      store.updateInterview(deptId, (p) => ({ ...p, status: 'in_progress' }))
      setStep('summary')
    }
  }

  // ---------- render ----------

  return (
    <div className="min-h-screen bg-porcelain-100">
      <header className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5">
        <Wordmark />
        {internal && onExit && (
          <button onClick={onExit} className="eyebrow hover:text-petrol-700">← Back</button>
        )}
      </header>

      {step === 'welcome' && (
        <Welcome
          resume={Boolean(resumable)}
          onBegin={() => setStep('context')}
          onResume={() => {
            if (!resumable) return
            setDeptId(resumable.departmentId)
            setStep('conversation')
          }}
        />
      )}

      {step === 'context' && (
        <ContextForm
          presetDeptId={internal ? presetDeptId : null}
          onSubmit={(ctx, chosenDept, useVoice) => void startConversation(ctx, chosenDept, useVoice)}
        />
      )}

      {step === 'conversation' && interview && dept && deptId && (
        <Conversation
          interview={interview}
          deptId={deptId}
          voiceMode={voiceMode}
          onVoiceModeChange={setVoiceMode}
          onWrapUp={() => setStep('summary')}
          error={error}
          setError={setError}
        />
      )}

      {step === 'summary' && interview && dept && deptId && (
        <Summary
          interview={interview}
          deptName={dept.name}
          error={error}
          onAddition={(text) => {
            store.updateInterview(deptId, (p) => ({
              ...p,
              messages: [...p.messages, { id: nextId(), role: 'user', text: `(Correction / addition to the summary) ${text}` }],
              facts: [...p.facts, { dimension: 'flow', text }],
            }))
          }}
          onBackToConversation={() => setStep('conversation')}
          onSubmit={() => void submit()}
        />
      )}

      {step === 'generating' && interview && (
        <main className="mx-auto flex max-w-md flex-col items-center px-6 pt-28 text-center">
          <PulseTrace coverage={interview.coverage} width={260} height={48} />
          <h2 className="mt-6 font-display text-xl font-bold text-carbon">Recording your discovery…</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate">
            Your conversation is being turned into structured understanding. This takes a moment.
          </p>
        </main>
      )}

      {step === 'done' && (
        <main className="mx-auto flex max-w-md flex-col items-center px-6 pt-24 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-petrol-50">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#0e5a52" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <h2 className="mt-6 font-display text-2xl font-bold text-carbon">Thank you.</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-slate">
            What you shared is now part of how Cyrix understands itself. Your experience — the real work, not the
            org chart — will directly shape where we invest in better systems. If anything comes to mind later,
            you're welcome to reach out to the Innovation Team.
          </p>
          <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.14em] text-slate-light">
            You may close this window
          </p>
        </main>
      )}
    </div>
  )
}

// ---------- Invitation notices ----------

function InviteNotice({ decision }: { decision: 'invalid' | 'disabled' | 'completed' }) {
  const copy = {
    invalid: {
      title: 'This invitation link isn\'t valid.',
      body: 'The link may have been mistyped or truncated. Please open it exactly as you received it, or ask the Cyrix Innovation Team to send a fresh one.',
    },
    disabled: {
      title: 'This invitation is no longer active.',
      body: 'A newer link may have been issued. Please ask the Cyrix Innovation Team for your current invitation.',
    },
    completed: {
      title: 'This invitation has already been completed.',
      body: 'Thank you — your conversation is already part of how Cyrix understands itself. If you\'d like to add more, the Innovation Team can send a fresh invitation.',
    },
  }[decision]
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-porcelain-100 px-6 text-center">
      <Wordmark />
      <h1 className="mt-6 font-display text-2xl font-bold text-carbon">{copy.title}</h1>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate">{copy.body}</p>
    </div>
  )
}

// ---------- Welcome ----------

function Welcome({ onBegin, resume, onResume }: {
  onBegin: () => void
  resume: boolean
  onResume: () => void
}) {
  return (
    <main className="mx-auto max-w-xl px-6 pb-16 pt-12 sm:pt-20">
      <p className="eyebrow mb-4">Cyrix Discovery Initiative</p>
      <h1 className="font-display text-3xl font-bold leading-tight tracking-tight text-carbon sm:text-4xl">
        Help us understand how your work <span className="text-petrol-700">really</span> happens.
      </h1>
      <p className="mt-5 text-[15px] leading-relaxed text-slate">
        You're about to have a conversation with an experienced consultant — about your ordinary working day.
        It takes around twenty minutes.
      </p>
      <ul className="mt-7 space-y-3.5">
        {[
          'This is not a performance evaluation — nothing here reflects on you or your team.',
          'There are no right or wrong answers. The ordinary, frustrating details are the valuable ones.',
          'We want to understand how work actually happens — not how the org chart says it should.',
          'The purpose is to improve your systems using AI, so the tedious parts of the job get lighter.',
          'Every department\'s experience matters. Yours is the only window we have into yours.',
        ].map((t, i) => (
          <li key={i} className="flex items-start gap-3 text-sm leading-relaxed text-carbon">
            <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-pulse-500" />
            {t}
          </li>
        ))}
      </ul>
      <div className="mt-9 flex flex-wrap items-center gap-4">
        <button onClick={onBegin} className="btn-primary !px-6 !py-3 text-[15px]">
          I'm ready — let's begin
        </button>
        {resume && (
          <button onClick={onResume} className="btn-ghost">Continue where I left off</button>
        )}
      </div>
      <p className="mt-6 text-xs leading-relaxed text-slate-light">
        Your words are seen only by the Cyrix Innovation Team, and only to design better systems.
      </p>
    </main>
  )
}

// ---------- Basic context ----------

function ContextForm({ presetDeptId, onSubmit }: {
  presetDeptId: string | null
  onSubmit: (ctx: ParticipantContext, deptId: string, useVoice: boolean) => void
}) {
  const [name, setName] = useState('')
  const [designation, setDesignation] = useState('')
  const [deptId, setDeptId] = useState(presetDeptId ?? '')
  const [stateBranch, setStateBranch] = useState('')
  const [years, setYears] = useState('')
  const [responsibility, setResponsibility] = useState('')
  const [useVoice, setUseVoice] = useState(false)
  const voiceAvailable = speechCtor() !== null

  const ready = designation.trim() && deptId && stateBranch.trim() && years.trim() && responsibility.trim()

  return (
    <main className="mx-auto max-w-xl px-6 pb-16 pt-8">
      <p className="eyebrow mb-2">Before we start</p>
      <h1 className="font-display text-2xl font-bold tracking-tight text-carbon">A little context about you</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate">
        This helps the conversation start where your work actually is — nothing more.
      </p>

      <form
        className="mt-7 space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          if (!ready) return
          onSubmit(
            { name: name.trim(), designation: designation.trim(), stateBranch: stateBranch.trim(), yearsAtCyrix: years.trim(), responsibility: responsibility.trim() },
            deptId,
            useVoice,
          )
        }}
      >
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Name" hint="optional">
            <input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="How should we address you?" />
          </Field>
          <Field label="Designation">
            <input value={designation} onChange={(e) => setDesignation(e.target.value)} className="input" placeholder="e.g. Warehouse Manager" required />
          </Field>
          <Field label="Department">
            <select value={deptId} onChange={(e) => setDeptId(e.target.value)} className="input" required disabled={Boolean(presetDeptId)}>
              <option value="" disabled>Select your department</option>
              {DEPARTMENTS.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </Field>
          <Field label="State / Branch">
            <input value={stateBranch} onChange={(e) => setStateBranch(e.target.value)} className="input" placeholder="e.g. Kerala — Kochi HO" required />
          </Field>
          <Field label="Years at Cyrix">
            <input value={years} onChange={(e) => setYears(e.target.value)} className="input" placeholder="e.g. 6 years" required />
          </Field>
        </div>
        <Field label="Your primary responsibility" hint="one or two sentences, in your own words">
          <textarea
            value={responsibility}
            onChange={(e) => setResponsibility(e.target.value)}
            rows={3}
            className="input resize-none"
            placeholder="What are you, personally, responsible for making happen?"
            required
          />
        </Field>

        <div>
          <p className="eyebrow mb-2">How would you like to talk?</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ModeChoice
              selected={!useVoice}
              onSelect={() => setUseVoice(false)}
              title="Type"
              desc="Answer in writing, at your own pace."
            />
            <ModeChoice
              selected={useVoice}
              onSelect={() => voiceAvailable && setUseVoice(true)}
              title="Speak"
              desc={voiceAvailable ? 'Talk naturally — your words are transcribed for you to review.' : 'Not supported in this browser — typing is available.'}
              disabled={!voiceAvailable}
            />
          </div>
          <p className="mt-2 text-xs text-slate-light">You can switch between speaking and typing at any point.</p>
        </div>

        <button type="submit" disabled={!ready} className="btn-primary !px-6 !py-3 text-[15px]">
          Start the conversation
        </button>
      </form>
    </main>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="eyebrow mb-1.5 block">
        {label}
        {hint && <span className="ml-1.5 normal-case tracking-normal text-slate-light">· {hint}</span>}
      </span>
      {children}
    </label>
  )
}

function ModeChoice({ selected, onSelect, title, desc, disabled = false }: {
  selected: boolean
  onSelect: () => void
  title: string
  desc: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`rounded-xl border p-4 text-left transition-colors ${
        selected ? 'border-petrol-600 bg-petrol-50' : 'border-porcelain-300 bg-white hover:border-petrol-500'
      } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
      aria-pressed={selected}
    >
      <span className="font-display text-sm font-bold text-carbon">{title}</span>
      <span className="mt-1 block text-xs leading-relaxed text-slate">{desc}</span>
    </button>
  )
}

// ---------- Conversation ----------

function Conversation({ interview, deptId, voiceMode, onVoiceModeChange, onWrapUp, error, setError }: {
  interview: Interview
  deptId: string
  voiceMode: boolean
  onVoiceModeChange: (v: boolean) => void
  onWrapUp: () => void
  error: string | null
  setError: (e: string | null) => void
}) {
  const store = useStore()
  const dept = deptById(deptId)
  const [draft, setDraft] = useState('')
  const [thinking, setThinking] = useState(false)
  const [listening, setListening] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const recRef = useRef<any>(null)
  const draftBaseRef = useRef('')

  const messages = interview.messages
  const answers = messages.filter((m) => m.role === 'user').length
  const avgCoverage = Object.values(interview.coverage).reduce((a, b) => a + b, 0) / 10
  const canWrapUp = answers >= 3

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length, thinking])

  // Speak the consultant's message in voice mode
  const lastAi = [...messages].reverse().find((m) => m.role === 'ai')
  useEffect(() => {
    if (!voiceMode || !lastAi || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(lastAi.text)
    u.rate = 1.02
    window.speechSynthesis.speak(u)
    return () => window.speechSynthesis.cancel()
  }, [lastAi?.id, voiceMode]) // eslint-disable-line react-hooks/exhaustive-deps

  function stopListening() {
    recRef.current?.stop?.()
    recRef.current = null
    setListening(false)
  }

  function startListening() {
    const Ctor = speechCtor()
    if (!Ctor) return
    window.speechSynthesis?.cancel()
    const rec = new Ctor()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = 'en-IN'
    draftBaseRef.current = draft ? draft + ' ' : ''
    let finals = ''
    rec.onresult = (e: any) => {
      let interim = ''
      finals = ''
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) finals += r[0].transcript
        else interim += r[0].transcript
      }
      setDraft((draftBaseRef.current + finals + interim).trimStart())
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    recRef.current = rec
    rec.start()
    setListening(true)
  }

  useEffect(() => () => { recRef.current?.stop?.(); window.speechSynthesis?.cancel() }, [])

  async function send() {
    const text = draft.trim()
    if (!text || thinking) return
    stopListening()
    setDraft('')
    setError(null)

    const userMsg: ChatMessage = { id: nextId(), role: 'user', text }
    const withUser: Interview = { ...interview, messages: [...interview.messages, userMsg] }
    store.setInterview(deptId, withUser)
    setThinking(true)

    try {
      if (interview.mode === 'live') {
        const result = await liveTurn(store.settings.apiKey, store.settings.model, dept, store.interviews, withUser.messages, interview.participant)
        store.updateInterview(deptId, (p) => ({
          ...p,
          messages: [...p.messages, { id: nextId(), role: 'ai', text: result.reply }],
          facts: [...p.facts, ...result.facts],
          coverage: result.coverage,
        }))
      } else {
        const result = simulatedTurn(withUser, text)
        await new Promise((r) => setTimeout(r, 700 + Math.random() * 600))
        store.updateInterview(deptId, (p) => ({
          ...p,
          messages: [...p.messages, { id: nextId(), role: 'ai', text: result.reply }],
          facts: [...p.facts, ...result.facts],
          coverage: result.coverage,
        }))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The connection hiccuped — your answer is safe. Try sending again.')
    } finally {
      setThinking(false)
    }
  }

  return (
    <main className="mx-auto flex h-[calc(100vh-64px)] max-w-3xl flex-col px-4 pb-4 sm:px-5">
      <div className="card flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* quiet header: progress only, no internal mechanics */}
        <header className="flex items-center justify-between gap-3 border-b border-porcelain-200 px-4 py-2.5">
          <PulseTrace coverage={interview.coverage} width={150} height={24} />
          <div className="flex items-center gap-2">
            <button
              onClick={() => { if (listening) stopListening(); onVoiceModeChange(!voiceMode) }}
              className="btn-ghost !px-3 !py-1.5 text-xs"
              disabled={!voiceMode && speechCtor() === null}
            >
              {voiceMode ? 'Switch to typing' : 'Switch to voice'}
            </button>
            <button
              onClick={onWrapUp}
              disabled={!canWrapUp}
              className={canWrapUp && avgCoverage > 0.5 ? 'btn-primary !px-3 !py-1.5 text-xs' : 'btn-ghost !px-3 !py-1.5 text-xs'}
              title={canWrapUp ? 'Review what the consultant understood' : 'A few more answers first'}
            >
              Wrap up
            </button>
          </div>
        </header>

        <div ref={scrollRef} className="rail-scroll flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={
                  m.role === 'user'
                    ? 'max-w-[85%] rounded-2xl rounded-br-md bg-petrol-700 px-4 py-3 text-[15px] leading-relaxed text-white'
                    : 'max-w-[85%] rounded-2xl rounded-bl-md border border-porcelain-200 bg-porcelain-50 px-4 py-3 text-[15px] leading-relaxed text-carbon'
                }
              >
                {m.text}
              </div>
            </div>
          ))}
          {thinking && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-md border border-porcelain-200 bg-porcelain-50 px-4 py-3">
                <span className="inline-flex gap-1.5" aria-label="The consultant is thinking">
                  <Dot delay="0ms" /><Dot delay="150ms" /><Dot delay="300ms" />
                </span>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mx-4 mb-2 rounded-lg border border-signal-100 bg-signal-50 px-3 py-2 text-xs text-signal-600" role="alert">
            {error}
          </div>
        )}

        <footer className="border-t border-porcelain-200 p-3">
          <div className="flex items-end gap-2">
            {voiceMode && (
              <button
                onClick={() => (listening ? stopListening() : startListening())}
                className={`flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full border transition-colors ${
                  listening ? 'border-signal-500 bg-signal-50 text-signal-600' : 'border-porcelain-300 bg-white text-petrol-700 hover:border-petrol-500'
                }`}
                aria-label={listening ? 'Stop listening' : 'Start speaking'}
                aria-pressed={listening}
              >
                {listening ? (
                  <span className="relative flex h-3.5 w-3.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-sm bg-signal-500 opacity-40" />
                    <span className="relative inline-flex h-3.5 w-3.5 rounded-sm bg-signal-500" />
                  </span>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="9" y="2" width="6" height="12" rx="3" />
                    <path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4" />
                  </svg>
                )}
              </button>
            )}
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send()
                }
              }}
              rows={2}
              placeholder={voiceMode ? (listening ? 'Listening — speak naturally…' : 'Tap the mic and speak, or type…') : 'Answer in your own words — specifics beat summaries…'}
              className="input min-h-[52px] flex-1 resize-none !py-2.5 leading-relaxed"
              aria-label="Your answer"
            />
            <button onClick={() => void send()} disabled={!draft.trim() || thinking} className="btn-primary !py-3">
              Send
            </button>
          </div>
        </footer>
      </div>
    </main>
  )
}

function Dot({ delay }: { delay: string }) {
  return (
    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-petrol-600" style={{ animationDelay: delay }} />
  )
}

// ---------- "What I understood" ----------

function Summary({ interview, deptName, onSubmit, onAddition, onBackToConversation, error }: {
  interview: Interview
  deptName: string
  onSubmit: () => void
  onAddition: (text: string) => void
  onBackToConversation: () => void
  error: string | null
}) {
  const [addition, setAddition] = useState('')
  const [added, setAdded] = useState(false)
  const byDim = (keys: string[]) =>
    interview.facts.filter((f) => keys.includes(f.dimension)).map((f) => f.text)
  const userText = interview.messages.filter((m) => m.role === 'user').map((m) => m.text).join(' ')

  const sections: { label: string; items: string[] }[] = [
    { label: 'Department', items: [`${deptName}${interview.participant ? ` — ${interview.participant.stateBranch}` : ''}`] },
    {
      label: 'Primary responsibilities',
      items: [interview.participant?.responsibility ?? '', ...byDim(['value'])].filter(Boolean).slice(0, 3),
    },
    { label: 'Current systems', items: detectSystems(userText) },
    { label: 'Top pain points', items: byDim(['delays', 'manual', 'time']).slice(0, 5) },
    { label: 'Knowledge risks', items: byDim(['knowledgeLoss', 'knowledge']).slice(0, 3) },
    { label: 'Current workflow', items: byDim(['flow']).slice(0, 4) },
  ]

  return (
    <main className="mx-auto max-w-2xl px-5 pb-16 pt-6">
      <p className="eyebrow mb-2">Before anything is submitted</p>
      <h1 className="font-display text-2xl font-bold tracking-tight text-carbon">What I understood</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate">
        Please look this over. If something is wrong or missing, correct it below — it matters that we got you right.
      </p>

      <div className="card mt-6 divide-y divide-porcelain-200">
        {sections.map((s) => (
          <div key={s.label} className="px-5 py-4">
            <h3 className="eyebrow mb-2">{s.label}</h3>
            {s.items.length > 0 ? (
              <ul className="space-y-1.5">
                {s.items.map((it, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed text-carbon">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-pulse-500" />
                    {it}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm italic text-slate-light">We didn't cover this — feel free to add it below.</p>
            )}
          </div>
        ))}
      </div>

      <div className="card mt-4 p-5">
        <h3 className="eyebrow mb-2">Add or correct something</h3>
        <textarea
          value={addition}
          onChange={(e) => setAddition(e.target.value)}
          rows={3}
          className="input resize-none"
          placeholder="Anything we misunderstood, or anything important we didn't ask about…"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={() => {
              if (!addition.trim()) return
              onAddition(addition.trim())
              setAddition('')
              setAdded(true)
            }}
            disabled={!addition.trim()}
            className="btn-ghost"
          >
            Add to my record
          </button>
          <button onClick={onBackToConversation} className="text-sm text-petrol-700 underline-offset-2 hover:underline">
            Continue the conversation instead
          </button>
          {added && <span className="font-mono text-[11px] text-petrol-600">ADDED ✓</span>}
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-signal-100 bg-signal-50 px-3 py-2 text-xs text-signal-600" role="alert">
          {error}
        </div>
      )}

      <div className="mt-6 flex items-center gap-4">
        <button onClick={onSubmit} className="btn-primary !px-6 !py-3 text-[15px]">
          Looks correct — submit
        </button>
        <span className="text-xs text-slate-light">Seen only by the Innovation Team.</span>
      </div>
    </main>
  )
}
