import type { ReactNode } from 'react'
import type { Coverage } from '../types'
import { DIMENSIONS } from '../types'

// ---------- Signature: the pulse trace -------------------------------------
// An ECG-like line with 10 segments — one per discovery dimension. Amplitude
// of each beat grows with coverage: a flat line means "not yet understood",
// a full waveform means the platform has truly heard the department.

export function PulseTrace({ coverage, width = 260, height = 44, stroke = '#14b8a3', base = '#cfd9d6' }: {
  coverage: Coverage
  width?: number
  height?: number
  stroke?: string
  base?: string
}) {
  const mid = height / 2
  const seg = width / DIMENSIONS.length
  let d = `M 0 ${mid}`
  DIMENSIONS.forEach((dim, i) => {
    const c = coverage[dim.key]
    const x0 = i * seg
    const amp = c * (height / 2 - 3)
    if (amp < 1) {
      d += ` L ${x0 + seg} ${mid}`
    } else {
      // one QRS-ish beat per dimension
      d += ` L ${x0 + seg * 0.25} ${mid}`
      d += ` L ${x0 + seg * 0.4} ${mid - amp * 0.35}`
      d += ` L ${x0 + seg * 0.55} ${mid + amp}`
      d += ` L ${x0 + seg * 0.7} ${mid - amp}`
      d += ` L ${x0 + seg * 0.82} ${mid + amp * 0.2}`
      d += ` L ${x0 + seg} ${mid}`
    }
  })
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="block">
      <line x1="0" y1={mid} x2={width} y2={mid} stroke={base} strokeWidth="1" />
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

// ---------- Primitives ------------------------------------------------------

export function Card({ title, children, className = '', action }: {
  title?: string
  children: ReactNode
  className?: string
  action?: ReactNode
}) {
  return (
    <section className={`card p-5 ${className}`} aria-label={title}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h3 className="eyebrow">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

const TAG_STYLES: Record<string, string> = {
  petrol: 'bg-petrol-50 text-petrol-700 border-petrol-100',
  pulse: 'bg-pulse-100 text-petrol-800 border-pulse-100',
  amber: 'bg-amber-50 text-amber-600 border-amber-100',
  signal: 'bg-signal-50 text-signal-600 border-signal-100',
  neutral: 'bg-porcelain-100 text-slate border-porcelain-200',
}

export function Tag({ children, tone = 'neutral' }: { children: ReactNode; tone?: keyof typeof TAG_STYLES }) {
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[11px] font-medium ${TAG_STYLES[tone]}`}>
      {children}
    </span>
  )
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div>
      <div className="eyebrow mb-1">{label}</div>
      <div className="font-display text-2xl font-bold leading-none text-carbon">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate">{sub}</div>}
    </div>
  )
}

export function SectionHeading({ index, title }: { index: string; title: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-3 border-b border-porcelain-200 pb-2">
      <span className="font-mono text-xs font-semibold text-pulse-500">{index}</span>
      <h3 className="font-display text-lg font-bold text-carbon">{title}</h3>
    </div>
  )
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="text-sm italic text-slate">{children}</p>
}

// severity → tone helpers
export const severityTone = (s: 1 | 2 | 3): keyof typeof TAG_STYLES => (s === 3 ? 'signal' : s === 2 ? 'amber' : 'neutral')
export const riskTone = (s: 'low' | 'medium' | 'high'): keyof typeof TAG_STYLES => (s === 'high' ? 'signal' : s === 'medium' ? 'amber' : 'neutral')

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="7" fill="#0e5a52" />
        <path d="M4 18h6l2.5-8 4 13 3-9 1.8 4H28" stroke="#2dd4bd" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="hidden font-display text-lg font-bold tracking-tight text-carbon sm:inline">
        Cyrix <span className="text-petrol-700">Discovery</span>
      </span>
    </span>
  )
}
