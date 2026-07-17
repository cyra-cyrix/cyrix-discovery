import { useMemo, useState } from 'react'
import { discoveredDepartments, interviewDeptLabel } from '../org'
import { useStore } from '../store'
import type { Horizon, Interview, Opportunity, PainPoint } from '../types'
import { Card, ProvenanceBadge, Stat, Tag, riskTone, severityTone } from '../components/ui'
import { cyra } from '../tokens'
import { OpportunityCard } from './Report'

// 09 — monochrome first: horizons are value steps of ink ordered by
// importance, not hues. Red is not spent here; on a screen carrying the
// wordmark the single permitted red is already the wordmark dot (03, P6).
const HORIZON_COLOR: Record<Horizon, string> = {
  quick: cyra.ink,
  medium: cyra.neutral500,
  strategic: cyra.neutral300,
}
const HORIZON_NAME: Record<Horizon, string> = {
  quick: 'Quick win',
  medium: '3–6 months',
  strategic: 'Strategic',
}

export function Dashboard({ onOpenPerson }: { onOpenPerson: (personId: string) => void }) {
  const { interviews, invites, people } = useStore()
  const [query, setQuery] = useState('')

  const completed = useMemo(
    () => Object.values(interviews).filter((i): i is Interview => i.status === 'complete'),
    [interviews],
  )
  const opportunities = useMemo(() => completed.flatMap((i) => i.opportunities), [completed])
  const painPoints = useMemo(
    () =>
      completed.flatMap((i) =>
        (i.report?.painPoints ?? []).map((p) => ({ ...p, personId: i.personId, label: interviewDeptLabel(i) })),
      ),
    [completed],
  )
  const knowledgeRisks = useMemo(
    () =>
      completed.flatMap((i) =>
        (i.report?.knowledgeRisks ?? []).map((r) => ({ ...r, personId: i.personId, label: interviewDeptLabel(i) })),
      ),
    [completed],
  )
  const quickWins = opportunities.filter((o) => o.horizon === 'quick')

  const searchResults = useMemo(() => {
    if (query.trim().length < 2) return null
    const q = query.toLowerCase()
    const opps = opportunities.filter(
      (o) => `${o.title} ${o.problem} ${o.solution} ${o.type}`.toLowerCase().includes(q),
    )
    const pains = painPoints.filter((p) => `${p.text} ${p.category}`.toLowerCase().includes(q))
    const facts = completed.flatMap((i) =>
      i.facts.filter((f) => f.text.toLowerCase().includes(q)).map((f) => ({ ...f, personId: i.personId, label: interviewDeptLabel(i) })),
    )
    return { opps, pains, facts }
  }, [query, opportunities, painPoints, completed])

  const inProgress = Object.values(interviews).filter((i) => i.status === 'in_progress' || i.status === 'generating').length
  const openInvites = Object.values(invites).filter((i) => i.status === 'active' && !i.completedAt).length
  const departments = useMemo(() => discoveredDepartments(interviews), [interviews])
  const knowledgeCoverage = completed.length
    ? completed.reduce((sum, i) => sum + Object.values(i.coverage).reduce((a, b) => a + b, 0) / 10, 0) / completed.length
    : 0

  if (completed.length === 0) {
    return <VisionDashboard inProgress={inProgress} invitedCount={openInvites} peopleCount={Object.keys(people).length} />
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
      <IntelligenceLayerNote className="mt-8" />
      <header className="pt-6">
        <p className="eyebrow mb-2">Organizational intelligence</p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="font-display text-display2 font-heavy tracking-display text-ink">Discovery dashboard</h1>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search everything — pain, opportunities, facts…"
            className="w-full max-w-sm border border-neutral-150 bg-paper px-4 py-2 text-bodySmall placeholder:text-neutral-500 focus:border-ink"
            aria-label="Search all discovery data"
          />
        </div>
        <p className="mt-2 font-sans text-label uppercase tracking-label text-neutral-700">
          {completed.length} {completed.length === 1 ? 'person' : 'people'} heard · {departments.length} {departments.length === 1 ? 'team' : 'teams'} discovered ·
          knowledge depth {Math.round(knowledgeCoverage * 100)}% · understanding: {understandingStage(completed.length)}
        </p>
      </header>

      {searchResults ? (
        <SearchResults results={searchResults} onOpenPerson={onOpenPerson} />
      ) : (
        <>
          {/* headline stats */}
          <section className="card mt-6 grid grid-cols-2 gap-6 p-6 md:grid-cols-4" aria-label="Headline numbers">
            <Stat label="People heard" value={completed.length} sub={`${departments.length} ${departments.length === 1 ? 'team' : 'teams'} discovered`} />
            <Stat label="AI opportunities" value={opportunities.length} sub={`${quickWins.length} deliverable in 30 days`} />
            <Stat label="Pain points mapped" value={painPoints.length} sub={`${painPoints.filter((p) => p.severity === 3).length} severe`} />
            <Stat label="Knowledge risks" value={knowledgeRisks.length} sub={`${knowledgeRisks.filter((r) => r.severity === 'high').length} single-person dependencies`} />
          </section>

          {/* Founder briefs — the 60-second read */}
          <Card title="Founder briefs — the 60-second read" className="mt-4">
            <div className="space-y-4">
              {completed
                .filter((i) => i.report)
                .map((i) => (
                  <div key={i.personId} className="flex flex-col gap-2 border-l-2 border-ink pl-4">
                    <div className="flex flex-wrap items-center gap-4">
                      <button
                        onClick={() => onOpenPerson(i.personId)}
                        className="w-fit font-display text-bodySmall font-heavy text-ink"
                      >
                        {interviewDeptLabel(i)} →
                      </button>
                      <ProvenanceBadge />
                    </div>
                    <p className="text-bodySmall text-ink">
                      {i.report?.founderBrief ?? i.report?.executiveSummary}
                    </p>
                  </div>
                ))}
            </div>
          </Card>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-5">
            {/* Priority matrix */}
            <Card title="Priority matrix — impact vs effort" className="lg:col-span-3">
              <PriorityMatrix opportunities={opportunities} />
            </Card>

            {/* Portfolio by type */}
            <Card title="Opportunity portfolio" className="lg:col-span-2">
              <PortfolioBars opportunities={opportunities} />
            </Card>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title="Top pain points across the company">
              <RankedPain pains={painPoints} onOpenPerson={onOpenPerson} />
            </Card>
            <Card title="Knowledge risks">
              <ul className="space-y-2">
                {knowledgeRisks
                  .sort((a, b) => (a.severity === 'high' ? -1 : 1) - (b.severity === 'high' ? -1 : 1))
                  .slice(0, 6)
                  .map((r, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Tag tone={riskTone(r.severity)}>{r.severity.toUpperCase()}</Tag>
                      <div className="text-bodySmall text-ink">
                        {r.text}
                        <button onClick={() => onOpenPerson(r.personId)} className="ml-2 font-sans text-label text-neutral-700 hover:underline">
                          {r.label.toUpperCase()} →
                        </button>
                      </div>
                    </li>
                  ))}
              </ul>
            </Card>
          </div>

          {/* Quick wins */}
          <Card title="Quick wins — deliverable in 30 days" className="mt-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {quickWins.slice(0, 6).map((o) => (
                <button key={o.id} onClick={() => onOpenPerson(o.personId)} className="text-left">
                  <div className="border border-neutral-150 p-4 transition-colors hover:border-ink">
                    <div className="flex items-center gap-2">
                      <Tag tone="ink">{o.type.toUpperCase()}</Tag>
                      <span className="font-sans text-label text-neutral-700">{interviewDeptLabel(interviews[o.personId]).toUpperCase()}</span>
                      <span className="ml-auto font-sans text-label text-neutral-700">{o.confidence}%</span>
                    </div>
                    <div className="mt-2 text-bodySmall font-medium text-ink">{o.title}</div>
                    <div className="mt-px line-clamp-2 text-label text-neutral-700">{o.businessValue}</div>
                  </div>
                </button>
              ))}
            </div>
          </Card>

          {/* Interview insights */}
          <Card title="Latest interview insights" className="mt-4">
            <ul className="space-y-2">
              {completed
                .flatMap((i) => i.facts.slice(-3).map((f) => ({ ...f, personId: i.personId, label: interviewDeptLabel(i) })))
                .slice(0, 8)
                .map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-bodySmall">
                    <span className="mt-2 h-2 w-2 shrink-0 bg-neutral-500" />
                    <span className="text-ink">
                      {f.text}
                      <span className="ml-2 font-sans text-label text-neutral-700">{f.label.toUpperCase()}</span>
                    </span>
                  </li>
                ))}
            </ul>
          </Card>
        </>
      )}
    </main>
  )
}

// ---------- Executive command center (pre-intelligence vision state) ----------
// Shown until the first real interview completes. Real zeros, no fake data:
// it communicates what the platform will become, then gets out of the way.

function understandingStage(completedCount: number): string {
  if (completedCount === 0) return 'Beginning'
  if (completedCount <= 3) return 'Forming'
  if (completedCount <= 8) return 'Deepening'
  return 'Comprehensive'
}

function IntelligenceLayerNote({ className = '' }: { className?: string }) {
  return (
    <div className={` border-l-4 border-ink bg-neutral-050 px-6 py-4 ${className}`}>
      <p className="text-body text-ink">
        CYRA Discovery is building the organization's intelligence layer — capturing how work happens today
        so AI transformation is based on evidence, not assumptions.
      </p>
      <p className="mt-4 text-label uppercase tracking-label text-neutral-500">
        Everything below is drafted from interviews and has not been validated by an expert.
      </p>
    </div>
  )
}

const EXPECTED_OUTCOMES = [
  'Organization Knowledge Map',
  'Department Capability Profiles',
  'Workflow Intelligence',
  'Knowledge Risk Identification',
  'Cross-Department Dependency Mapping',
  'AI Opportunity Portfolio',
  'Business Impact Estimation',
  'Quick Wins',
  'Strategic AI Roadmap',
  'Executive Founder Briefs',
]

const JOURNEY = [
  'Department Interview',
  'Knowledge Extraction',
  'Workflow Mapping',
  'Pain Point Discovery',
  'Cross-Department Analysis',
  'Opportunity Identification',
  'Business Validation',
  'Experiment Design',
  'Pilot',
  'Organization Learning',
  'AI Transformation Roadmap',
]

const DELIVERABLES = [
  'Executive Summary',
  'Department Capability Map',
  'AI Opportunity Portfolio',
  'Founder Brief',
  'Organization Knowledge Graph',
  'Company-wide Bottleneck Analysis',
  'ROI Estimates',
  'Prioritized AI Roadmap',
]

const WHY_CARDS = [
  { title: 'Knowledge', body: 'Capture institutional knowledge before it is lost.' },
  { title: 'Operations', body: 'Understand how work actually happens.' },
  { title: 'Innovation', body: 'Identify practical AI opportunities grounded in evidence.' },
  { title: 'Transformation', body: 'Create a long-term AI roadmap based on organizational understanding.' },
]

function VisionDashboard({ inProgress, invitedCount, peopleCount }: { inProgress: number; invitedCount: number; peopleCount: number }) {
  return (
    <main className="mx-auto max-w-4xl px-6 pb-24 sm:px-6">
      <IntelligenceLayerNote className="mt-8" />

      {/* Mission */}
      <header className="mx-auto mt-14 max-w-2xl text-center">
        <p className="eyebrow">CYRA Discovery</p>
        <h1 className="mt-4 font-display text-display2 font-heavy leading-tight tracking-display text-ink sm:text-display2">
          Understanding the organization
          <br />
          before transforming it.
        </h1>
        <p className="mt-6 text-body text-neutral-700">
          Our objective is to understand how every team creates value, identify organizational
          bottlenecks, capture institutional knowledge, and discover measurable AI opportunities —
          starting from the people who do the work, not from an org chart.
        </p>
      </header>

      {/* Discovery progress — real numbers, honestly zero */}
      <section className="card mt-14 grid grid-cols-2 gap-x-6 gap-y-8 p-6 sm:grid-cols-3 lg:grid-cols-5" aria-label="Discovery progress">
        <Stat label="People interviewed" value="0" />
        <Stat label="People on the roster" value={peopleCount} />
        <Stat label="Invitations open" value={invitedCount} />
        <Stat label="Interviews in conversation" value={inProgress} />
        <Stat label="Understanding" value="Beginning" />
      </section>

      {/* Expected outcomes */}
      <section className="mt-16" aria-label="Expected outcomes">
        <SectionIntro
          title="What this platform will hold"
          sub="Each capability is generated automatically from real interviews — none of it is written by hand."
        />
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {EXPECTED_OUTCOMES.map((o) => (
            <div key={o} className="flex items-center gap-4 border border-dashed border-neutral-150 bg-paper/60 px-4 py-4">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={cyra.neutral500} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
                <circle cx="12" cy="12" r="10" />
                <path d="M8 12.5l2.5 2.5L16 9.5" />
              </svg>
              <div>
                <div className="text-bodySmall font-medium text-ink">{o}</div>
                <div className="font-sans text-label uppercase tracking-label text-neutral-500">Will be generated automatically</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* AI discovery journey */}
      <section className="mt-16" aria-label="AI discovery journey">
        <SectionIntro
          title="The discovery journey"
          sub="Every department moves through the same evidence-first path — interviews now, transformation later."
        />
        <ol className="relative mx-auto mt-8 max-w-md">
          <div className="absolute bottom-3 left-[13px] top-3 w-px bg-neutral-150" aria-hidden="true" />
          {JOURNEY.map((step, i) => {
            const activeNow = i === 0
            return (
              <li key={step} className="relative flex items-center gap-4 py-2 pl-0">
                <span
                  className={`z-10 flex h-[27px] w-[27px] shrink-0 items-center justify-center border font-sans text-label font-medium ${
 activeNow
 ? 'border-ink bg-ink text-paper'
 : 'border-neutral-150 bg-paper text-neutral-700'
 }`}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className={`text-bodySmall ${activeNow ? 'font-medium text-ink' : 'text-neutral-700'}`}>
                  {step}
                  {activeNow && <span className="ml-2 font-sans text-label uppercase tracking-label text-neutral-700">← we are here</span>}
                </span>
              </li>
            )
          })}
        </ol>
      </section>

      {/* What management will receive */}
      <section className="mt-16" aria-label="What management will receive">
        <SectionIntro
          title="What management will receive"
          sub="Delivered continuously as interviews complete — not as a one-time report."
        />
        <div className="card mt-6 grid grid-cols-1 divide-y divide-neutral-150 sm:grid-cols-2 sm:divide-y-0">
          {DELIVERABLES.map((d, i) => (
            <div key={d} className={`flex items-center gap-4 px-6 py-4 ${i % 2 === 0 ? 'sm:border-r sm:border-neutral-150' : ''} ${i >= 2 ? 'sm:border-t sm:border-neutral-150' : ''}`}>
              <span className="h-2 w-2 shrink-0 bg-neutral-900" />
              <span className="text-bodySmall text-ink">{d}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Why this matters */}
      <section className="mt-16" aria-label="Why this matters">
        <SectionIntro title="Why this matters" sub="" />
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {WHY_CARDS.map((c) => (
            <div key={c.title} className="card p-6">
              <h3 className="font-display text-body font-heavy text-ink">{c.title}</h3>
              <p className="mt-2 text-bodySmall text-neutral-700">{c.body}</p>
            </div>
          ))}
        </div>
      </section>

      <p className="mt-16 text-center font-sans text-label uppercase tracking-label text-neutral-500">
        The platform earns every insight from real interviews
      </p>
    </main>
  )
}

function SectionIntro({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mx-auto max-w-xl text-center">
      <h2 className="font-display text-heading font-heavy tracking-display text-ink">{title}</h2>
      {sub && <p className="mt-2 text-bodySmall text-neutral-700">{sub}</p>}
    </div>
  )
}

// ---------- Priority matrix (SVG scatter) ----------

function PriorityMatrix({ opportunities }: { opportunities: Opportunity[] }) {
  const [hover, setHover] = useState<Opportunity | null>(null)
  const W = 560
  const H = 340
  const PAD = { l: 44, r: 16, t: 16, b: 40 }
  const x = (effort: number) => PAD.l + ((effort - 0.5) / 10) * (W - PAD.l - PAD.r)
  const y = (impact: number) => H - PAD.b - ((impact - 0.5) / 10) * (H - PAD.t - PAD.b)
  const midX = x(5.25)
  const midY = y(5.25)

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Opportunities plotted by implementation effort (x) and business impact (y)">
        {/* quadrant tints */}
        <rect x={PAD.l} y={PAD.t} width={midX - PAD.l} height={midY - PAD.t} fill={cyra.neutral050} rx="6" />
        {/* quadrant labels */}
        <text x={PAD.l + 8} y={PAD.t + 18}  fontSize="11" fontFamily={cyra.fontBody} fontWeight="600">DO FIRST</text>
        <text x={midX + 8} y={PAD.t + 18} fill={cyra.neutral700} fontSize="11" fontFamily={cyra.fontBody}>BIG BETS</text>
        <text x={PAD.l + 8} y={H - PAD.b - 8} fill={cyra.neutral700} fontSize="11" fontFamily={cyra.fontBody}>FILL-INS</text>
        <text x={midX + 8} y={H - PAD.b - 8} fill={cyra.neutral700} fontSize="11" fontFamily={cyra.fontBody}>RECONSIDER</text>
        {/* axes */}
        <line x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} stroke={cyra.neutral150} />
        <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={H - PAD.b} stroke={cyra.neutral150} />
        <line x1={midX} y1={PAD.t} x2={midX} y2={H - PAD.b} stroke={cyra.neutral150} strokeDasharray="4 4" />
        <line x1={PAD.l} y1={midY} x2={W - PAD.r} y2={midY} stroke={cyra.neutral150} strokeDasharray="4 4" />
        <text x={(PAD.l + W - PAD.r) / 2} y={H - 10} textAnchor="middle" fill={cyra.neutral700} fontSize="11" fontFamily={cyra.fontBody}>EFFORT →</text>
        <text x={14} y={(PAD.t + H - PAD.b) / 2} textAnchor="middle" fill={cyra.neutral700} fontSize="11" fontFamily={cyra.fontBody} transform={`rotate(-90 14 ${(PAD.t + H - PAD.b) / 2})`}>IMPACT →</text>
        {/* marks — ≥8px, 2px surface ring for overlap separation */}
        {opportunities.map((o) => (
          <circle
            key={o.id}
            cx={x(o.effort)}
            cy={y(o.impact)}
            r={hover?.id === o.id ? 8 : 6}
            fill={HORIZON_COLOR[o.horizon]}
            stroke={cyra.paper}
            strokeWidth="2"
            className="cursor-pointer transition-colors"
            onMouseEnter={() => setHover(o)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>
      {/* legend */}
      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
        {(Object.keys(HORIZON_COLOR) as Horizon[]).map((h) => (
          <span key={h} className="inline-flex items-center gap-2 text-label text-neutral-700">
            <span className="h-2 w-2" style={{ backgroundColor: HORIZON_COLOR[h] }} />
            {HORIZON_NAME[h]}
          </span>
        ))}
      </div>
      {/* tooltip */}
      {hover && (
        <div className="pointer-events-none absolute left-1/2 top-2 z-10 w-64 -translate-x-1/2 border border-neutral-150 bg-paper p-4">
          <div className="text-label font-medium text-ink">{hover.title}</div>
          <div className="mt-px font-sans text-label text-neutral-700">
            IMPACT {hover.impact}/10 · EFFORT {hover.effort}/10 · {hover.confidence}% CONF
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- Portfolio bars (single series, one hue, direct labels) ----------

function PortfolioBars({ opportunities }: { opportunities: Opportunity[] }) {
  const counts = new Map<string, number>()
  for (const o of opportunities) counts.set(o.type, (counts.get(o.type) ?? 0) + 1)
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1])
  const max = Math.max(1, ...rows.map(([, n]) => n))
  return (
    <div className="space-y-2">
      {rows.map(([type, n]) => (
        <div key={type} className="flex items-center gap-2">
          <span className="w-40 shrink-0 truncate text-label text-ink">{type}</span>
          <div className="h-4 flex-1 bg-transparent">
            <div
              className="flex h-4 items-center -[4px] bg-neutral-900 pl-2"
              style={{ width: `${(n / max) * 100}%`, minWidth: 22 }}
            >
              <span className="font-sans text-label font-medium text-paper">{n}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------- Pain ranking ----------

function RankedPain({ pains, onOpenPerson }: {
  pains: (PainPoint & { personId: string; label: string })[]
  onOpenPerson: (id: string) => void
}) {
  const sorted = [...pains].sort((a, b) => b.severity - a.severity).slice(0, 7)
  return (
    <ul className="space-y-2">
      {sorted.map((p, i) => (
        <li key={i} className="flex items-start gap-2">
          <Tag tone={severityTone(p.severity)}>{p.category.toUpperCase()}</Tag>
          <div className="text-bodySmall text-ink">
            {p.text}
            <button onClick={() => onOpenPerson(p.personId)} className="ml-2 font-sans text-label text-neutral-700 hover:underline">
              {p.label.toUpperCase()} →
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}

// ---------- Search ----------

function SearchResults({ results, onOpenPerson }: {
  results: {
    opps: Opportunity[]
    pains: (PainPoint & { personId: string; label: string })[]
    facts: { dimension: string; text: string; label: string }[]
  }
  onOpenPerson: (id: string) => void
}) {
  const total = results.opps.length + results.pains.length + results.facts.length
  return (
    <section className="mt-6 space-y-4" aria-label="Search results">
      <p className="font-sans text-label text-neutral-700">{total} RESULTS</p>
      {results.opps.length > 0 && (
        <Card title="Opportunities">
          <div className="space-y-4">
            {results.opps.map((o) => (
              <OpportunityCard key={o.id} o={o} />
            ))}
          </div>
        </Card>
      )}
      {results.pains.length > 0 && (
        <Card title="Pain points">
          <RankedPain pains={results.pains} onOpenPerson={onOpenPerson} />
        </Card>
      )}
      {results.facts.length > 0 && (
        <Card title="Interview facts">
          <ul className="space-y-2">
            {results.facts.map((f, i) => (
              <li key={i} className="text-bodySmall text-ink">
                {f.text}
                <span className="ml-2 font-sans text-label text-neutral-700">{f.label.toUpperCase()}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {total === 0 && <p className="text-bodySmall text-neutral-700">Nothing found — try a different term.</p>}
    </section>
  )
}
