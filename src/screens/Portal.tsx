import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import type { ChatMessage, Interview, ParticipantContext, Person } from '../types'
import { newInterview, newPersonId } from '../types'
import { personFromContext } from '../org'
import { liveOpening, liveTurn } from '../engine/claude'
import { detectSystems, inferDepartmentName, simulatedOpening, simulatedTurn } from '../engine/simulated'
import * as api from '../api'
import { InitiativeLabel, ModuleLabel, ProgressRule, WorkingRule, Wordmark, coverageDepth } from '../components/ui'
import { cyra } from '../tokens'

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

export function Portal({ inviteToken = null, presetPersonId = null, internal = false, onFinished, onExit }: {
  inviteToken?: string | null // participant path — unique invitation token from the URL
  presetPersonId?: string | null // internal test-run path only
  internal?: boolean
  onFinished?: (personId: string) => void
  onExit?: () => void
}) {
  const store = useStore()

  const [step, setStep] = useState<Step>('welcome')
  const [personId, setPersonId] = useState<string | null>(presetPersonId)
  const [voiceMode, setVoiceMode] = useState(false)
  const [stage, setStage] = useState('Reading the conversation')
  const [error, setError] = useState<string | null>(null)

  // The invitation is resolved against SHARED storage, so the link works on a
  // device that has never seen the roster. This is the whole point of the
  // pilot backend; `decision` is settled once, at entry, so completing the
  // interview cannot flip the session into "already completed" mid-flow.
  //
  // The same call returns any interview already underway. An invitation is a
  // way back IN, not a one-shot: it resolves to `completed` only once the
  // interview is genuinely complete, so a refresh, a closed browser or a
  // failed report all land the participant back on their own transcript.
  const [decision, setDecision] = useState<api.InviteDecision | 'loading'>(
    internal || inviteToken === null ? 'accept' : 'loading',
  )
  const [invitedPerson, setInvitedPerson] = useState<Person | null>(null)
  const [restored, setRestored] = useState<Interview | null>(null)
  const restorePlaced = useRef(false)

  useEffect(() => {
    if (internal || !inviteToken) return
    let cancelled = false
    void api.resolveInvite(inviteToken)
      .then((r) => {
        if (cancelled) return
        setDecision(r.decision)
        if (r.person) { setInvitedPerson(r.person); setPersonId(r.person.id) }
        if (r.interview) {
          // The server's copy is already the source of truth — adopt it, don't
          // checkpoint it straight back.
          store.adoptInterview(r.interview.personId, r.interview)
          setPersonId(r.interview.personId)
          setRestored(r.interview)
        }
      })
      .catch(() => { if (!cancelled) setDecision('unreachable' as api.InviteDecision) })
    return () => { cancelled = true }
  }, [inviteToken, internal]) // eslint-disable-line react-hooks/exhaustive-deps

  // Put a restored interview back exactly where it stopped. Runs once — after
  // that the live state, not the snapshot the invitation returned, is the
  // truth. Must sit above the early returns below to stay a legal hook.
  useEffect(() => {
    if (!restored || restorePlaced.current) return
    restorePlaced.current = true
    if (restored.status === 'generating') {
      // They already submitted; the report is being written server-side.
      setStep('generating')
      setStage('Writing the discovery report')
      void pollUntilDone(inviteToken ?? '', restored.personId).catch((e) => {
        setError(e instanceof Error ? e.message : 'The report could not be written.')
        setStep('summary')
      })
    } else if (restored.status === 'analysis_failed') {
      // The transcript survived; only the report failed. Let them resubmit.
      setError(restored.analysisError
        ? `The report could not be written (${restored.analysisError}). Your answers are saved — you can submit again.`
        : 'The report could not be written. Your answers are saved — you can submit again.')
      setStep('summary')
    }
    // `in_progress` stays on Welcome, which already offers "Continue where I
    // left off". The affordance was built for this; it was only ever gated to
    // the internal test-run.
  }, [restored]) // eslint-disable-line react-hooks/exhaustive-deps

  const interview = personId ? store.interviews[personId] : undefined
  const knownPerson = invitedPerson ?? (personId ? store.people[personId] : undefined)

  if (decision === 'loading') return <PortalLoading />
  if (decision !== 'accept') return <InviteNotice decision={decision} />

  // Anything unfinished with answers already in it can be resumed — by a
  // participant on their own link, not just the internal test-run. The
  // transcript lives in shared storage now, so there is something to resume to.
  const resumable = interview?.status === 'in_progress' && interview.participant && interview.messages.length > 0
    ? interview
    : undefined

  // ---------- flow transitions ----------

  async function startConversation(ctx: ParticipantContext, useVoice: boolean) {
    setVoiceMode(useVoice)
    setError(null)

    // The invited person, or a new record built from what they just told us
    // (a participant may arrive without a roster entry). Either way the record
    // is persisted centrally when they submit.
    const id = personId ?? newPersonId()
    const person = knownPerson ?? personFromContext(id, ctx)
    setPersonId(id)
    setInvitedPerson(ctx.department.trim() && !person.department
      ? { ...person, department: ctx.department.trim() }
      : person)

    const token = internal ? null : inviteToken
    const iv = newInterview(id, 'live', ctx, token)
    void store.setInterview(id, iv, token)
    setStep('conversation')

    try {
      const opening = await liveOpening(store.settings.model, id, ctx, inviteToken)
      void store.updateInterview(id, (p) => ({
        ...p,
        messages: [{ id: nextId(), role: 'ai', text: opening }],
      }), token)
    } catch {
      // The conversation must never dead-end for a participant: if the server
      // cannot reach Claude, the offline interviewer takes over silently.
      void store.updateInterview(id, (p) => ({
        ...p,
        mode: 'simulated',
        messages: [{ id: nextId(), role: 'ai', text: simulatedOpening(ctx) }],
      }), token)
    }
  }

  /** Watch our own submission until the server says the report has landed.
   *  Extracted from submit() so a restored `generating` interview can re-enter
   *  it after a refresh: the analysis runs server-side, so rejoining it is
   *  just polling again — there is nothing to redo. */
  async function pollUntilDone(token: string, id: string) {
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 3000))
      const { status } = await api.pollInterviewStatus(token)
      if (status === 'complete') {
        if (internal && onFinished) { void store.refresh(); onFinished(id); return }
        setStep('done'); return
      }
      if (status === 'analysis_failed') {
        throw new Error('The report could not be written. Your answers are saved — you can submit again.')
      }
    }
    // Timed out watching, but the work is server-side and the answers are
    // stored: say so honestly rather than implying the interview was lost.
    setStep('done')
  }

  async function submit() {
    if (!interview || !personId) return
    setStep('generating')
    setError(null)
    setStage('Sending your conversation')
    try {
      // The invitation only knew their name and email. Everything else about
      // them — role, team, state — was discovered in this conversation, so
      // hand it back with the transcript: the roster learns from the
      // interview rather than being filled in before it.
      const ctx = interview.participant
      const enriched: Person | null = knownPerson
        ? {
            ...knownPerson,
            name: knownPerson.name && knownPerson.name !== 'Name withheld' ? knownPerson.name : (ctx?.name || knownPerson.name),
            designation: knownPerson.designation || ctx?.designation || '',
            state: knownPerson.state || ctx?.stateBranch || '',
            department: knownPerson.department || ctx?.department.trim() || '',
          }
        : ctx
          ? personFromContext(personId, ctx)
          : null

      // Hand the transcript to shared storage. The report is written by a
      // background function server-side, so it survives this browser closing.
      await api.submitInterview(inviteToken ?? '', interview, enriched)
      setStage('Writing the discovery report')
      await pollUntilDone(inviteToken ?? '', personId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Your answers are still here — try submitting again.')
      setStep('summary')
    }
  }

  // ---------- render ----------

  return (
    <div className="min-h-screen bg-neutral-050">
      <header className="mx-auto flex h-16 max-w-3xl items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <Wordmark />
          <ModuleLabel>Discovery</ModuleLabel>
        </div>
        {internal && onExit && (
          <button onClick={onExit} className="eyebrow hover:text-ink">← Back</button>
        )}
      </header>

      {step === 'welcome' && (
        <Welcome
          resume={Boolean(resumable)}
          onBegin={() => setStep('context')}
          onResume={() => {
            if (!resumable) return
            setPersonId(resumable.personId)
            setStep('conversation')
          }}
        />
      )}

      {step === 'context' && (
        <ContextForm
          knownPerson={knownPerson}
          onSubmit={(ctx, useVoice) => void startConversation(ctx, useVoice)}
        />
      )}

      {step === 'conversation' && interview && personId && (
        <Conversation
          interview={interview}
          personId={personId}
          voiceMode={voiceMode}
          onVoiceModeChange={setVoiceMode}
          onWrapUp={() => setStep('summary')}
          error={error}
          setError={setError}
        />
      )}

      {step === 'summary' && interview && personId && (
        <Summary
          interview={interview}
          error={error}
          onAddition={(text) => {
            void store.updateInterview(personId, (p) => ({
              ...p,
              messages: [...p.messages, { id: nextId(), role: 'user', text: `(Correction / addition to the summary) ${text}` }],
              facts: [...p.facts, { dimension: 'flow', text }],
            }), internal ? null : inviteToken)
          }}
          onBackToConversation={() => setStep('conversation')}
          onSubmit={() => void submit()}
        />
      )}

      {step === 'generating' && (
        <main className="mx-auto max-w-md px-6 pt-28">
          <h2 className="font-display text-heading font-heavy text-ink">Recording your discovery.</h2>
          <p className="mb-6 mt-2 text-bodySmall text-neutral-700">
            Your conversation is being turned into structured understanding. This takes about a minute.
            You can leave this page and come back — nothing is lost.
          </p>
          <WorkingRule stage={stage} />
        </main>
      )}

      {step === 'done' && (
        <main className="mx-auto flex max-w-md flex-col items-center px-6 pt-24 text-center">
          <div className="flex h-14 w-14 items-center justify-center bg-neutral-050">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={cyra.ink} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <h2 className="mt-6 font-display text-display2 font-heavy text-ink">Thank you.</h2>
          <p className="mt-4 text-body text-neutral-700">
            What you shared is now part of how Cyrix understands itself. Your experience — the real work, not the
            org chart — will directly shape where we invest in better systems. If anything comes to mind later,
            you're welcome to reach out to the Innovation Team.
          </p>
          <p className="mt-6 font-sans text-label uppercase tracking-label text-neutral-500">
            You may close this window
          </p>
        </main>
      )}
    </div>
  )
}

// ---------- Invitation notices ----------

function PortalLoading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-050 px-6">
      <Wordmark />
      <div className="mt-6 w-40"><WorkingRule stage="Checking your invitation" /></div>
    </div>
  )
}

function InviteNotice({ decision }: { decision: string }) {
  const copy = ({
    unknown: {
      title: 'This invitation link isn\'t valid.',
      body: 'The link may have been mistyped or truncated. Please open it exactly as you received it, or ask the Cyrix Innovation Team to send a fresh one.',
    },
    unreachable: {
      title: 'We can\'t reach the server right now.',
      body: 'Your invitation is fine — this is on our side. Please try the link again in a few minutes.',
    },
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
  } as Record<string, { title: string; body: string }>)[decision] ?? {
    title: 'This invitation link isn\'t valid.',
    body: 'Please ask the Cyrix Innovation Team for a fresh invitation.',
  }
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-050 px-6 text-center">
      <Wordmark />
      <div className="mt-2"><InitiativeLabel /></div>
      <h1 className="mt-6 font-display text-display2 font-heavy text-ink">{copy.title}</h1>
      <p className="mt-4 max-w-sm text-bodySmall text-neutral-700">{copy.body}</p>
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
      <p className="eyebrow mb-4">CYRA Discovery Initiative</p>
      <h1 className="font-display text-display2 font-heavy leading-tight tracking-display text-ink sm:text-display2">
        Help us understand how your work <span className="text-ink">really</span> happens.
      </h1>
      <p className="mt-6 text-body text-neutral-700">
        You're about to have a conversation with an experienced consultant — about your ordinary working day.
        It takes around twenty minutes.
      </p>
      <ul className="mt-8 space-y-4.5">
        {[
          'This is not a performance evaluation — nothing here reflects on you or your team.',
          'There are no right or wrong answers. The ordinary, frustrating details are the valuable ones.',
          'We want to understand how work actually happens — not how the org chart says it should.',
          'The purpose is to improve your systems using AI, so the tedious parts of the job get lighter.',
          'Every department\'s experience matters. Yours is the only window we have into yours.',
        ].map((t, i) => (
          <li key={i} className="flex items-start gap-4 text-bodySmall text-ink">
            <span className="mt-[7px] h-1.5 w-1.5 shrink-0 bg-neutral-500" />
            {t}
          </li>
        ))}
      </ul>
      <div className="mt-8 flex flex-wrap items-center gap-4">
        {/* When an unfinished conversation exists, resuming is the ONLY door.
            Offering "begin" beside it looked symmetrical but was destructive:
            the primary button silently checkpointed a fresh interview over the
            participant's saved answers (BL-2). One state, one action. */}
        {resume ? (
          <button onClick={onResume} className="btn-primary !px-6 !py-4 text-body">
            Continue where I left off
          </button>
        ) : (
          <button onClick={onBegin} className="btn-primary !px-6 !py-4 text-body">
            I'm ready — let's begin
          </button>
        )}
      </div>
      <p className="mt-6 text-label text-neutral-500">
        Your words are seen only by the Cyrix Innovation Team, and only to design better systems.
      </p>
    </main>
  )
}

// ---------- Basic context ----------

function ContextForm({ knownPerson, onSubmit }: {
  knownPerson: Person | undefined
  onSubmit: (ctx: ParticipantContext, useVoice: boolean) => void
}) {
  const [name, setName] = useState(knownPerson?.name === 'Name withheld' ? '' : knownPerson?.name ?? '')
  const [designation, setDesignation] = useState(knownPerson?.designation ?? '')
  const [department, setDepartment] = useState(knownPerson?.department ?? '')
  const [stateBranch, setStateBranch] = useState(knownPerson?.state ?? '')
  const [years, setYears] = useState('')
  const [responsibility, setResponsibility] = useState('')
  const [useVoice, setUseVoice] = useState(false)
  const voiceAvailable = speechCtor() !== null

  const ready = designation.trim() && stateBranch.trim() && years.trim() && responsibility.trim()

  return (
    <main className="mx-auto max-w-xl px-6 pb-16 pt-8">
      <p className="eyebrow mb-2">Before we start</p>
      <h1 className="font-display text-display2 font-heavy tracking-display text-ink">A little context about you</h1>
      <p className="mt-2 text-bodySmall text-neutral-700">
        This helps the conversation start where your work actually is — nothing more.
      </p>

      <form
        className="mt-8 space-y-6"
        onSubmit={(e) => {
          e.preventDefault()
          if (!ready) return
          onSubmit(
            {
              name: name.trim(),
              designation: designation.trim(),
              department: department.trim(),
              stateBranch: stateBranch.trim(),
              yearsAtCyrix: years.trim(),
              responsibility: responsibility.trim(),
            },
            useVoice,
          )
        }}
      >
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Field label="Name" hint="optional">
            <input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="How should we address you?" />
          </Field>
          <Field label="Designation">
            <input value={designation} onChange={(e) => setDesignation(e.target.value)} className="input" placeholder="e.g. Warehouse Manager" required />
          </Field>
          <Field label="Department or team" hint="optional — in your own words">
            <input
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="input"
              placeholder="Whatever you call it internally"
            />
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          <p className="mt-2 text-label text-neutral-500">You can switch between speaking and typing at any point.</p>
        </div>

        <button type="submit" disabled={!ready} className="btn-primary !px-6 !py-4 text-body">
          Start the conversation
        </button>
      </form>
    </main>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="eyebrow mb-2 block">
        {label}
        {hint && <span className="ml-2 normal-case tracking-normal text-neutral-500">· {hint}</span>}
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
      className={` border p-4 text-left transition-colors ${
 selected ? 'border-ink bg-neutral-050' : 'border-neutral-150 bg-paper hover:border-ink'
 } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
      aria-pressed={selected}
    >
      <span className="font-display text-bodySmall font-heavy text-ink">{title}</span>
      <span className="mt-2 block text-label text-neutral-700">{desc}</span>
    </button>
  )
}

// ---------- Conversation ----------

function Conversation({ interview, personId, voiceMode, onVoiceModeChange, onWrapUp, error, setError }: {
  interview: Interview
  personId: string
  voiceMode: boolean
  onVoiceModeChange: (v: boolean) => void
  onWrapUp: () => void
  error: string | null
  setError: (e: string | null) => void
}) {
  const store = useStore()
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

    const token = interview.inviteToken
    const userMsg: ChatMessage = { id: nextId(), role: 'user', text }
    const withUser: Interview = { ...interview, messages: [...interview.messages, userMsg] }

    // Checkpoint the answer BEFORE asking the AI anything. This ordering is
    // what requirements 4 and 5 turn on: if the turn then fails — a timeout, a
    // 502, a dropped connection — the answer is already durable, and the
    // error below is honest when it says it is safe.
    await store.setInterview(personId, withUser, token)
    setThinking(true)

    try {
      if (interview.mode === 'live') {
        const result = await liveTurn(store.settings.model, personId, withUser.messages, interview.participant, interview.inviteToken)
        await store.updateInterview(personId, (p) => ({
          ...p,
          messages: [...p.messages, { id: nextId(), role: 'ai', text: result.reply }],
          facts: [...p.facts, ...result.facts],
          coverage: result.coverage,
        }), token)
      } else {
        const result = simulatedTurn(withUser, text)
        await new Promise((r) => setTimeout(r, 700 + Math.random() * 600))
        await store.updateInterview(personId, (p) => ({
          ...p,
          messages: [...p.messages, { id: nextId(), role: 'ai', text: result.reply }],
          facts: [...p.facts, ...result.facts],
          coverage: result.coverage,
        }), token)
      }
    } catch (e) {
      // Two engines, one contract — for TURNS, not just the opening. If the
      // live engine fails mid-conversation (timeout, truncation, refusal, the
      // server being down), the offline interviewer takes over silently so the
      // participant's twenty minutes never dead-end. Their answer is already
      // checkpointed above, so nothing is at risk either way.
      if (interview.mode === 'live') {
        try {
          const result = simulatedTurn(withUser, text)
          await store.updateInterview(personId, (p) => ({
            ...p,
            mode: 'simulated',
            messages: [...p.messages, { id: nextId(), role: 'ai', text: result.reply }],
            facts: [...p.facts, ...result.facts],
            coverage: result.coverage,
          }), token)
        } catch {
          setError('The connection hiccuped — your answer is safe. Try sending again.')
        }
      } else {
        // Never surface a raw exception string to a participant.
        void e
        setError('The connection hiccuped — your answer is safe. Try sending again.')
      }
    } finally {
      setThinking(false)
    }
  }

  return (
    <main className="mx-auto flex h-[calc(100vh-64px)] max-w-3xl flex-col px-4 pb-4 sm:px-6">
      <div className="card flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* quiet header: progress only, no internal mechanics */}
        <header className="flex items-center justify-between gap-4 border-b border-neutral-150 px-4 py-2">
          <div className="w-40"><ProgressRule value={coverageDepth(interview.coverage)} /></div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { if (listening) stopListening(); onVoiceModeChange(!voiceMode) }}
              className="btn-secondary !px-4 !py-2 text-label"
              disabled={!voiceMode && speechCtor() === null}
            >
              {voiceMode ? 'Switch to typing' : 'Switch to voice'}
            </button>
            <button
              onClick={onWrapUp}
              disabled={!canWrapUp}
              className={canWrapUp && avgCoverage > 0.5 ? 'btn-primary !px-4 !py-2 text-label' : 'btn-secondary !px-4 !py-2 text-label'}
              title={canWrapUp ? 'Review what the consultant understood' : 'A few more answers first'}
            >
              Wrap up
            </button>
          </div>
        </header>

        <div ref={scrollRef} className="rail-scroll flex-1 space-y-4 overflow-y-auto px-4 py-6 sm:px-6">
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={
                  m.role === 'user'
                    ? 'max-w-[85%]   bg-ink px-4 py-4 text-body  text-white'
                    : 'max-w-[85%]   border border-neutral-150 bg-neutral-050 px-4 py-4 text-body  text-ink'
                }
              >
                {m.text}
              </div>
            </div>
          ))}
          {thinking && (
            <div className="max-w-[85%] pt-2">
              <WorkingRule stage="Reading your answer" />
            </div>
          )}
        </div>

        {error && (
          <div className="mx-4 mb-2 border border-error bg-neutral-050 px-4 py-2 text-label text-error" role="alert">
            {error}
          </div>
        )}

        <footer className="border-t border-neutral-150 p-4">
          <div className="flex items-end gap-2">
            {voiceMode && (
              <button
                onClick={() => (listening ? stopListening() : startListening())}
                className={`flex h-[52px] w-[52px] shrink-0 items-center justify-center border transition-colors ${
 listening ? 'border-error bg-neutral-050 text-error' : 'border-neutral-150 bg-paper text-ink hover:border-ink'
 }`}
                aria-label={listening ? 'Stop listening' : 'Start speaking'}
                aria-pressed={listening}
              >
                {listening ? (
                  <span className="h-4 w-4 bg-error" aria-hidden="true" />
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
              className="input min-h-[52px] flex-1 resize-none !py-2"
              aria-label="Your answer"
            />
            <button onClick={() => void send()} disabled={!draft.trim() || thinking} className="btn-primary !py-4">
              Send
            </button>
          </div>
        </footer>
      </div>
    </main>
  )
}

// ---------- "What I understood" ----------

function Summary({ interview, onSubmit, onAddition, onBackToConversation, error }: {
  interview: Interview
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
    {
      label: 'Your team',
      items: [
        [
          interview.departmentName?.trim() ||
            interview.participant?.department.trim() ||
            inferDepartmentName(interview.participant?.designation ?? ''),
          interview.participant?.stateBranch,
        ]
          .filter(Boolean)
          .join(' — '),
      ],
    },
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
    <main className="mx-auto max-w-2xl px-6 pb-16 pt-6">
      <p className="eyebrow mb-2">Before anything is submitted</p>
      <h1 className="font-display text-display2 font-heavy tracking-display text-ink">What I understood</h1>
      <p className="mt-2 text-bodySmall text-neutral-700">
        Please look this over. If something is wrong or missing, correct it below — it matters that we got you right.
      </p>

      <div className="card mt-6 divide-y divide-neutral-150">
        {sections.map((s) => (
          <div key={s.label} className="px-6 py-4">
            <h3 className="eyebrow mb-2">{s.label}</h3>
            {s.items.length > 0 ? (
              <ul className="space-y-2">
                {s.items.map((it, i) => (
                  <li key={i} className="flex items-start gap-2 text-bodySmall text-ink">
                    <span className="mt-[7px] h-1 w-1 shrink-0 bg-neutral-500" />
                    {it}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-bodySmall italic text-neutral-500">We didn't cover this — feel free to add it below.</p>
            )}
          </div>
        ))}
      </div>

      <div className="card mt-4 p-6">
        <h3 className="eyebrow mb-2">Add or correct something</h3>
        <textarea
          value={addition}
          onChange={(e) => setAddition(e.target.value)}
          rows={3}
          className="input resize-none"
          placeholder="Anything we misunderstood, or anything important we didn't ask about…"
        />
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <button
            onClick={() => {
              if (!addition.trim()) return
              onAddition(addition.trim())
              setAddition('')
              setAdded(true)
            }}
            disabled={!addition.trim()}
            className="btn-secondary"
          >
            Add to my record
          </button>
          <button onClick={onBackToConversation} className="text-bodySmall text-ink underline-offset-2 hover:underline">
            Continue the conversation instead
          </button>
          {added && <span className="font-sans text-label text-neutral-700">ADDED ✓</span>}
        </div>
      </div>

      {error && (
        <div className="mt-4 border border-error bg-neutral-050 px-4 py-2 text-label text-error" role="alert">
          {error}
        </div>
      )}

      <div className="mt-6 flex items-center gap-4">
        <button onClick={onSubmit} className="btn-primary !px-6 !py-4 text-body">
          Looks correct — submit
        </button>
        <span className="text-label text-neutral-500">Seen only by the Innovation Team.</span>
      </div>
    </main>
  )
}
