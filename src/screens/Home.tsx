import { DEPARTMENTS } from '../data/departments'
import { useStore } from '../store'
import { emptyCoverage } from '../types'
import { Card, PulseTrace, Tag } from '../components/ui'

export function Home({ onOpenDept }: { onOpenDept: (deptId: string) => void }) {
  const { interviews, settings } = useStore()

  const complete = Object.values(interviews).filter((i) => i.status === 'complete').length
  const inProgress = Object.values(interviews).filter((i) => i.status === 'in_progress').length
  const oppCount = Object.values(interviews).reduce((n, i) => n + i.opportunities.length, 0)

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
      {/* Hero — the thesis */}
      <section className="pt-10 sm:pt-14" aria-label="Introduction">
        <p className="eyebrow mb-3">Organizational intelligence · Cyrix Healthcare</p>
        <h1 className="max-w-3xl font-display text-4xl font-bold leading-[1.05] tracking-tight text-carbon sm:text-5xl">
          Every department knows things
          <br />
          <span className="text-petrol-700">no system has ever heard.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-slate">
          Twenty minutes with an experienced AI consultant — not a survey, not a chatbot. It listens to how your
          work actually flows, maps where knowledge lives and leaks, and surfaces where AI can genuinely help.
          Understanding first; opportunities emerge from evidence.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-3">
          <div>
            <span className="font-display text-2xl font-bold text-carbon">{complete}</span>
            <span className="ml-2 text-sm text-slate">of {DEPARTMENTS.length} departments heard</span>
          </div>
          <div>
            <span className="font-display text-2xl font-bold text-carbon">{oppCount}</span>
            <span className="ml-2 text-sm text-slate">AI opportunities identified</span>
          </div>
          <Tag tone={settings.apiKey ? 'pulse' : 'neutral'}>
            {settings.apiKey ? 'LIVE AI · CLAUDE' : 'DEMO MODE · ADD API KEY IN SETTINGS'}
          </Tag>
        </div>
      </section>

      {/* Department grid */}
      <section className="mt-10" aria-label="Departments">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="eyebrow">Departments — start or review a discovery interview</h2>
          {inProgress > 0 && <Tag tone="amber">{inProgress} IN PROGRESS</Tag>}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {DEPARTMENTS.map((d) => {
            const iv = interviews[d.id]
            const status = iv?.status ?? 'not_started'
            const coverage = iv?.coverage ?? emptyCoverage()
            const avg = Object.values(coverage).reduce((a, b) => a + b, 0) / 10
            return (
              <div
                key={d.id}
                onClick={() => onOpenDept(d.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenDept(d.id) } }}
                role="button"
                tabIndex={0}
                className="card group cursor-pointer p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-rail"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display text-[15px] font-bold text-carbon group-hover:text-petrol-700">
                    {d.name}
                  </h3>
                  {status === 'complete' && <Tag tone="pulse">HEARD</Tag>}
                  {status === 'in_progress' && <Tag tone="amber">LISTENING</Tag>}
                  {status === 'generating' && <Tag tone="amber">ANALYSING</Tag>}
                  {status === 'not_started' && <Tag>NOT STARTED</Tag>}
                </div>
                <p className="mt-1.5 line-clamp-2 min-h-[2.4em] text-xs leading-relaxed text-slate">{d.blurb}</p>
                <div className="mt-3">
                  <PulseTrace coverage={coverage} width={230} height={30} stroke={status === 'complete' ? '#14b8a3' : '#8aa09c'} />
                </div>
                <div className="mt-2 flex items-center justify-between font-mono text-[11px] text-slate">
                  <span>{d.headRole}</span>
                  <span>{status === 'not_started' ? 'BEGIN →' : `${Math.round(avg * 100)}% UNDERSTOOD`}</span>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* How it works — quiet, three beats */}
      <section className="mt-12 grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="How it works">
        <Card title="01 · Listen">
          <p className="text-sm leading-relaxed text-slate">
            A consultant-grade conversation: "walk me through yesterday", "what happened next", "why". No fixed
            questionnaire — every answer shapes the next question.
          </p>
        </Card>
        <Card title="02 · Understand">
          <p className="text-sm leading-relaxed text-slate">
            The engine builds a living model of the department — workflows, decisions, knowledge assets and risks —
            visible as the pulse trace fills.
          </p>
        </Card>
        <Card title="03 · Discover">
          <p className="text-sm leading-relaxed text-slate">
            Only then do opportunities emerge: classified, costed, confidence-scored and placed on the company-wide
            map — quick wins to strategic bets.
          </p>
        </Card>
      </section>
    </main>
  )
}
