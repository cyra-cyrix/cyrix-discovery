import { interviewDeptLabel } from '../org'
import { useStore } from '../store'
import type { Horizon, Opportunity } from '../types'
import { Card, EmptyNote, ProgressRule, ProvenanceBadge, ProvenanceLine, SectionHeading, Tag, coverageDepth, riskTone, severityTone } from '../components/ui'

const HORIZON_LABEL: Record<Horizon, string> = {
  quick: 'Quick wins · 30 days',
  medium: 'Medium · 3–6 months',
  strategic: 'Strategic · 1–3 years',
}

export function ReportScreen({ personId, onExit, onRestart }: {
  personId: string
  onExit: () => void
  onRestart: () => void
}) {
  const { interviews, people } = useStore()
  const person = people[personId]
  const iv = interviews[personId]
  if (!iv || !iv.report || !iv.profile) {
    return (
      <main className="mx-auto max-w-2xl px-6 pt-20 text-center">
        <p className="text-bodySmall text-neutral-700">No completed discovery for this person yet.</p>
        <button onClick={onExit} className="btn-primary mt-4">Back</button>
      </main>
    )
  }
  const { report, profile } = iv
  const byHorizon = (h: Horizon) => iv.opportunities.filter((o) => o.horizon === h)

  return (
    <main className="mx-auto max-w-4xl px-4 pb-20 sm:px-6">
      <div className="flex items-center justify-between pt-8">
        <button onClick={onExit} className="eyebrow hover:text-ink">← People</button>
        <button onClick={onRestart} className="btn-secondary !px-4 !py-2 text-label">Re-interview</button>
      </div>

      <header className="mt-6">
        <div className="mb-2 flex flex-wrap items-center gap-4">
          <p className="eyebrow">Discovery report</p>
          <ProvenanceBadge />
        </div>
        <h1 className="font-display text-display2 font-heavy tracking-display text-ink">{interviewDeptLabel(iv)}</h1>
        <p className="mt-2 text-bodySmall text-neutral-700">
          {iv.participant?.designation ?? ''}
          {iv.participant?.stateBranch ? ` · ${iv.participant.stateBranch}` : ''}
        </p>
        <div className="mt-4 border-t border-hairline border-neutral-150 pt-2">
          <ProvenanceLine meta={{
            capturedFrom: person?.name ?? iv.participant?.name ?? 'a participant',
            capturedAt: iv.completedAt,
            source: 'INTERVIEW',
          }} />
        </div>
        <div className="mt-4 max-w-md">
          <ProgressRule value={coverageDepth(iv.coverage)} label="Understanding depth" />
        </div>
        <p className="mt-2 text-label uppercase tracking-label text-neutral-500">
          {iv.facts.length} facts · {iv.opportunities.length} opportunities · {report.painPoints.length} pain points
        </p>
      </header>

      {/* Founder brief — the 60-second read */}
      {report.founderBrief && (
        <div className="mt-8 border-l-4 border-ink bg-neutral-050 p-6">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-4">
            <h3 className="eyebrow !text-ink">Founder brief — the 60-second read</h3>
            <ProvenanceBadge />
          </div>
          <p className="text-body text-ink">{report.founderBrief}</p>
        </div>
      )}

      {/* 1 · Executive summary */}
      <Card className="mt-4">
        <SectionHeading index="01" title="Executive summary" />
        <p className="text-body text-ink">{report.executiveSummary}</p>
      </Card>

      {/* 2 · Capability map */}
      <Card className="mt-4">
        <SectionHeading index="02" title="Department capability map" />
        <div className="space-y-2">
          {report.capabilityMap.map((c) => (
            <div key={c.area} className="flex flex-wrap items-start gap-2 sm:flex-nowrap">
              <Tag tone={c.strength === 'strong' ? 'success' : c.strength === 'gap' ? 'error' : 'warning'}>
                {c.strength.toUpperCase()}
              </Tag>
              <div className="min-w-0">
                <span className="text-bodySmall font-medium text-ink">{c.area}</span>
                <span className="text-bodySmall text-neutral-700"> — {c.note}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* 3 · Current workflow */}
      <Card className="mt-4">
        <SectionHeading index="03" title="Current workflow" />
        <ol className="space-y-4">
          {report.workflow.map((w, i) => (
            <li key={i} className="flex gap-4">
              <span className="mt-px flex h-6 w-6 shrink-0 items-center justify-center bg-neutral-050 font-sans text-label font-medium text-ink">
                {i + 1}
              </span>
              <div>
                <div className="text-bodySmall font-medium text-ink">{w.step}</div>
                <div className="text-bodySmall text-neutral-700">{w.detail}</div>
                {w.friction && (
                  <div className="mt-2 text-label text-error">⚠ {w.friction}</div>
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
        <div className="space-y-2">
          {report.painPoints.map((p, i) => (
            <div key={i} className="flex items-start gap-2">
              <Tag tone={severityTone(p.severity)}>{p.category.toUpperCase()}</Tag>
              <span className="text-bodySmall text-ink">{p.text}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* 5 & 6 · Knowledge + decisions */}
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <SectionHeading index="05" title="Knowledge flow" />
          <p className="text-bodySmall text-neutral-700">{report.knowledgeFlow}</p>
          <div className="mt-4 space-y-2">
            {report.knowledgeRisks.map((r, i) => (
              <div key={i} className="flex items-start gap-2">
                <Tag tone={riskTone(r.severity)}>{r.severity.toUpperCase()}</Tag>
                <span className="text-bodySmall text-ink">{r.text}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <SectionHeading index="06" title="Decision flow" />
          <p className="text-bodySmall text-neutral-700">{report.decisionFlow}</p>
          <div className="mt-4">
            <div className="eyebrow mb-2">Approval chain</div>
            {profile.approvalFlow.length > 0 ? (
              <p className="text-bodySmall text-ink">{profile.approvalFlow.join(' → ')}</p>
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
                  <li key={o.id} className="text-bodySmall text-ink">
                    <span className="font-medium">{o.title}</span>
                    <span className="ml-2 font-sans text-label text-neutral-700">{o.confidence}% CONF</span>
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
          <p className="text-bodySmall text-ink">{report.estimatedImpact}</p>
        </Card>
        <Card>
          <SectionHeading index="12" title="Questions that remain" />
          <ul className="list-inside list-disc space-y-2 text-bodySmall text-neutral-700">
            {report.unanswered.map((u, i) => <li key={i}>{u}</li>)}
          </ul>
        </Card>
      </div>
    </main>
  )
}

export function OpportunityCard({ o }: { o: Opportunity }) {
  return (
    <div className="border border-neutral-150 bg-neutral-050 p-4">
      <div className="flex flex-wrap items-center gap-4">
        <Tag tone="ink">{o.type}</Tag>
        <h4 className="font-display text-bodySmall font-heavy text-ink">{o.title}</h4>
        <span className="ml-auto flex items-center gap-4">
          <Tag>{o.complexity} complexity · {o.confidence}% confidence</Tag>
          <ProvenanceBadge />
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-bodySmall sm:grid-cols-2">
        <div>
          <dt className="eyebrow !text-label">Problem</dt>
          <dd className="mt-px text-ink">{o.problem}</dd>
        </div>
        <div>
          <dt className="eyebrow !text-label">Current cost</dt>
          <dd className="mt-px text-ink">{o.currentCost}</dd>
        </div>
        <div>
          <dt className="eyebrow !text-label">Potential AI solution</dt>
          <dd className="mt-px text-ink">{o.solution}</dd>
        </div>
        <div>
          <dt className="eyebrow !text-label">Expected business value</dt>
          <dd className="mt-px text-ink">{o.businessValue}</dd>
        </div>
      </dl>
      <div className="mt-2 font-sans text-label text-neutral-700">PEOPLE: {o.peopleInvolved}</div>
    </div>
  )
}
