import type { ReactNode } from 'react'
import type { Coverage } from '../types'

// ---------- Identity ---------------------------------------------------------
// 01 — wordmark-only. CYRA drops the literal pulse-line and circular emblem of
// earlier explorations; no separate icon mark is created for any module. The
// red terminal dot is the single accent, and on any screen carrying the
// wordmark it is that composition's one permitted red (03, P6).

export function Wordmark() {
  return (
    <span className="font-display text-heading font-heavy tracking-display text-ink">
      CYRA<span className="text-red">.</span>
    </span>
  )
}

// 02 Module Identity Rule (E3, ratified 2026-07-17): modules are distinguished
// by name only — a tracked uppercase label in the fixed header position. No
// per-module accent, no per-module icon.
export function ModuleLabel({ children }: { children: ReactNode }) {
  return <span className="eyebrow border-l-hairline border-neutral-150 pl-4">{children}</span>
}

// 01 — institutional attribution attaches at thresholds (login, reports,
// external artifacts), never inside working screens.
export function InitiativeLabel() {
  return <span className="eyebrow text-neutral-500">A CYRIX INITIATIVE</span>
}

// ---------- Progress ---------------------------------------------------------
// 06/08 — determinate progress is a hairline that fills. This replaces the ECG
// "pulse trace": that device was decoration (P2) and was the exact emblem the
// brand retired (01; 00 caveat 2).

export function ProgressRule({ value, label }: { value: number; label?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <div className="w-full">
      {label && (
        <div className="mb-2 flex items-baseline justify-between gap-4">
          <span className="eyebrow">{label}</span>
          <span className="text-label font-medium text-neutral-700">{pct}%</span>
        </div>
      )}
      <div
        className="h-px w-full bg-neutral-150"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? 'Progress'}
      >
        <div
          className="h-px bg-ink transition-[width] duration-state ease-standard"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

/** Understanding depth across the ten discovery dimensions. */
export function coverageDepth(coverage: Coverage): number {
  const values = Object.values(coverage)
  return values.reduce((a, b) => a + b, 0) / values.length
}

// 07 § Latency honesty / 08 — indeterminate work is a hairline sweep with
// staged text naming the actual step. Never a fake percentage, never a spinner
// with no information, never "Thinking…".
export function WorkingRule({ stage }: { stage?: string }) {
  return (
    <div className="w-full" role="status" aria-live="polite">
      <div className="working-rule" />
      {stage && <p className="mt-2 text-label uppercase tracking-label text-neutral-500">{stage}</p>}
    </div>
  )
}

// ---------- Provenance -------------------------------------------------------
// 10 § provenance invariant + 06 — knowledge is never shown without its state.
// AI output and validated knowledge are never visually interchangeable.

export interface ProvenanceMeta {
  capturedFrom: string
  capturedAt: number | null
  /** Discovery extends the platform's source-stream vocabulary with INTERVIEW (02 P10). */
  source: 'INTERVIEW'
  validatedBy?: string | null
}

export function ProvenanceLine({ meta }: { meta: ProvenanceMeta }) {
  const date = meta.capturedAt
    ? new Date(meta.capturedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : null
  return (
    <p className="text-label uppercase tracking-label text-neutral-500">
      Captured from {meta.capturedFrom}
      {date && <> · {date}</>} · Source {meta.source} ·{' '}
      {meta.validatedBy
        ? <>Validated by {meta.validatedBy}</>
        : <span className="text-neutral-700">Not yet validated</span>}
    </p>
  )
}

// ---------- Primitives -------------------------------------------------------

export function Card({ title, children, className = '', action }: {
  title?: string
  children: ReactNode
  className?: string
  action?: ReactNode
}) {
  return (
    <section className={`card p-6 ${className}`} aria-label={title}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-4">
          {title && <h3 className="eyebrow">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

// 06 § Tables — status is a text badge (uppercase micro-label in a semantic
// colour), never a coloured pill background.
export type Tone = 'neutral' | 'success' | 'warning' | 'error' | 'ink'

const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-neutral-500',
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-error',
  ink: 'text-ink',
}

export function Tag({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return (
    <span className={`inline-flex items-center text-label font-medium uppercase tracking-label ${TONE_TEXT[tone]}`}>
      {children}
    </span>
  )
}

// 10 § provenance invariant — machine-produced content is always labelled by
// epistemic status, uncoloured. Knowledge is never shown without its state (06).
export function ProvenanceBadge({ state = 'draft' }: { state?: 'draft' | 'approved' }) {
  return state === 'approved'
    ? <Tag tone="success">Approved</Tag>
    : <Tag tone="neutral">Draft — unvalidated</Tag>
}

// 09 § scoreboard — hero number in the display voice + micro-label beneath.
export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div>
      <div className="eyebrow mb-2">{label}</div>
      <div className="font-display text-display2 font-heavy text-ink">{value}</div>
      {sub && <div className="mt-2 text-label text-neutral-700">{sub}</div>}
    </div>
  )
}

export function SectionHeading({ index, title }: { index: string; title: string }) {
  return (
    <div className="mb-4 flex items-baseline gap-4 border-b border-hairline border-neutral-150 pb-2">
      <span className="text-label font-medium text-neutral-500">{index}</span>
      <h3 className="font-display text-heading font-heavy text-ink">{title}</h3>
    </div>
  )
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="text-bodySmall text-neutral-500">{children}</p>
}

// severity → tone helpers (E2 semantic palette, ratified 2026-07-17)
export const severityTone = (s: 1 | 2 | 3): Tone => (s === 3 ? 'error' : s === 2 ? 'warning' : 'neutral')
export const riskTone = (s: 'low' | 'medium' | 'high'): Tone => (s === 'high' ? 'error' : s === 'medium' ? 'warning' : 'neutral')
