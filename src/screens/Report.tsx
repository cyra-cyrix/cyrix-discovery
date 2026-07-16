import { deptById } from '../data/departments'
import { useStore } from '../store'
import type { Horizon, Opportunity } from '../types'
import { Card, EmptyNote, PulseTrace, SectionHeading, Tag, riskTone, severityTone } from '../components/ui'

const HORIZON_LABEL: Record<Horizon, string> = {
  quick: 'Quick wins · 30 days',
  medium: 'Medium · 3–6 months',
  strategic: 'Strategic · 1–3 years',
}

export function ReportScreen({ deptId, onExit, onRestart }: {
  deptId: string
  onExit: () => void
  onRestart: () => void
}) {
  const { interviews } = useStore()
  const dept = deptById(deptId)
  const iv = interviews[deptId]
  if (!iv || !iv.report || !iv.profile) {
    return (
      <main className="mx-auto max-w-2xl px-6 pt-20 text-center">
        <p className="text-sm text-slate">No completed discovery for this department yet.</p>
        <button onClick={onExit} className="btn-primary mt-4">Back</button>
      </main>
    )
  }
  const { report, profile } = iv
  const byHorizon = (h: Horizon) => iv.opportunities.filter((o) => o.horizon === h)

  return (
    <main className="mx-auto max-w-4xl px-4 pb-20 sm:px-6">
      <div className="flex items-center justify-between pt-8">
        <button onClick={onExit} className="eyebrow hover:text-petrol-700">← All departments</button>
        <button onClick={onRestart} className="btn-ghost !px-3 !py-1.5 text-xs">Re-interview</button>
      </div>

      <header className="mt-6">
        <p className="eyebrow mb-2">Discovery report · {iv.mode === 'live' ? 'live AI interview' : 'demo interview'}</p>
        <h1 className="font-display text-3xl font-bold tracking-tight text-carbon sm:text-4xl">{dept.name}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <PulseTrace coverage={iv.coverage} width={260} height={36} />
          <span className="font-mono text-[11px] text-slate">
            {iv.facts.length} FACTS · {iv.opportunities.length} OPPORTUNITIES · {report.painPoints.length} PAIN POINTS
          </span>
        </div>
      </header>

      {/* Founder brief — the 60-second read */}
      {report.founderBrief && (
        <div className="mt-8 rounded-xl border-l-4 border-petrol-600 bg-petrol-50 p-5">
          <h3 className="eyebrow mb-2 !text-petrol-700">Founder brief — the 60-second read</h3>
          <p className="text-[15px] leading-relaxed text-carbon">{report.founderBrief}</p>
        </div>
      )}

      {/* 1 · Executive summary */}
      <Card className="mt-4">
        <SectionHeading index="01" title="Executive summary" />
        <p className="text-[15px] leading-relaxed text-carbon">{report.executiveSummary}</p>
      </Card>

      {/* 2 · Capability map */}
      <Card className="mt-4">
        <SectionHeading index="02" title="Department capability map" />
        <div className="space-y-2.5">
          {report.capabilityMap.map((c) => (
            <div key={c.area} className="flex flex-wrap items-start gap-2 sm:flex-nowrap">
              <Tag tone={c.strength === 'strong' ? 'pulse' : c.strength === 'gap' ? 'signal' : 'amber'}>
                {c.strength.toUpperCase()}
              </Tag>
              <div className="min-w-0">
                <span className="text-sm font-medium text-carbon">{c.area}</span>
                <span className="text-sm text-slate"> — {c.note}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* 3 · Current workflow */}
      <Card className="mt-4">
        <SectionHeading index="03" title="Current workflow" />
        <ol className="space-y-3">
          {report.workflow.map((w, i) => (
            <li key={i} className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-petrol-50 font-mono text-[11px] font-semibold text-petrol-700">
                {i + 1}
              </span>
              <div>
                <div className="text-sm font-medium text-carbon">{w.step}</div>
                <div className="text-sm text-slate">{w.detail}</div>
                {w.friction && (
                  <div className="mt-1 text-xs text-signal-600">⚠ {w.friction}</div>
                )}
              </div>
            </li>
          ))}
          {report.workflow.length === 0 && <EmptyNote>Workflow detail was not covered deeply enough.</EmptyNote>}
        </ol>
      </Card>

      {/* 4 · Pain points */}
      <Card className="mt-4">
        <SectionHeading index="04" title="Pain point analysis" />
        <div className="space-y-2.5">
          {report.painPoints.map((p, i) => (
            <div key={i} className="flex items-start gap-2">
              <Tag tone={severityTone(p.severity)}>{p.category.toUpperCase()}</Tag>
              <span className="text-sm text-carbon">{p.text}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* 5 & 6 · Knowledge + decisions */}
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <SectionHeading index="05" title="Knowledge flow" />
          <p className="text-sm leading-relaxed text-slate">{report.knowledgeFlow}</p>
          <div className="mt-3 space-y-2">
            {report.knowledgeRisks.map((r, i) => (
              <div key={i} className="flex items-start gap-2">
                <Tag tone={riskTone(r.severity)}>{r.severity.toUpperCase()}</Tag>
                <span className="text-sm text-carbon">{r.text}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <SectionHeading index="06" title="Decision flow" />
          <p className="text-sm leading-relaxed text-slate">{report.decisionFlow}</p>
          <div className="mt-3">
            <div className="eyebrow mb-1.5">Approval chain</div>
            {profile.approvalFlow.length > 0 ? (
              <p className="text-sm text-carbon">{profile.approvalFlow.join(' → ')}</p>
            ) : (
              <EmptyNote>Not surfaced in this interview.</EmptyNote>
            )}
          </div>
        </Card>
      </div>

      {/* 7 · Opportunity map */}
      <Card className="mt-4">
        <SectionHeading index="07" title="AI opportunity map" />
        <div className="space-y-4">
          {iv.opportunities.map((o) => <OpportunityCard key={o.id} o={o} />)}
        </div>
      </Card>

      {/* 8-10 · Horizons */}
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        {(['quick', 'medium', 'strategic'] as Horizon[]).map((h, hi) => (
          <Card key={h}>
            <SectionHeading index={`0${8 + hi}`} title={HORIZON_LABEL[h]} />
            {byHorizon(h).length > 0 ? (
              <ul className="space-y-2">
                {byHorizon(h).map((o) => (
                  <li key={o.id} className="text-sm text-carbon">
                    <span className="font-medium">{o.title}</span>
                    <span className="ml-1.5 font-mono text-[10px] text-slate">{o.confidence}% CONF</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyNote>None in this horizon.</EmptyNote>
            )}
          </Card>
        ))}
      </div>

      {/* 11 · Impact, 12 · Unanswered */}
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <SectionHeading index="11" title="Estimated business impact" />
          <p className="text-sm leading-relaxed text-carbon">{report.estimatedImpact}</p>
        </Card>
        <Card>
          <SectionHeading index="12" title="Questions that remain" />
          <ul className="list-inside list-disc space-y-1.5 text-sm text-slate">
            {report.unanswered.map((u, i) => <li key={i}>{u}</li>)}
          </ul>
        </Card>
      </div>
    </main>
  )
}

export function OpportunityCard({ o, showDept }: { o: Opportunity; showDept?: string }) {
  return (
    <div className="rounded-lg border border-porcelain-200 bg-porcelain-50 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Tag tone="petrol">{o.type.toUpperCase()}</Tag>
        <h4 className="font-display text-sm font-bold text-carbon">{o.title}</h4>
        {showDept && <span className="font-mono text-[10px] text-slate">· {showDept.toUpperCase()}</span>}
        <span className="ml-auto font-mono text-[11px] text-slate">
          {o.complexity.toUpperCase()} COMPLEXITY · {o.confidence}% CONF
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="eyebrow !text-[10px]">Problem</dt>
          <dd className="mt-0.5 text-carbon">{o.problem}</dd>
        </div>
        <div>
          <dt className="eyebrow !text-[10px]">Current cost</dt>
          <dd className="mt-0.5 text-carbon">{o.currentCost}</dd>
        </div>
        <div>
          <dt className="eyebrow !text-[10px]">Potential AI solution</dt>
          <dd className="mt-0.5 text-carbon">{o.solution}</dd>
        </div>
        <div>
          <dt className="eyebrow !text-[10px]">Expected business value</dt>
          <dd className="mt-0.5 text-carbon">{o.businessValue}</dd>
        </div>
      </dl>
      <div className="mt-2 font-mono text-[10px] text-slate">PEOPLE: {o.peopleInvolved}</div>
    </div>
  )
}
