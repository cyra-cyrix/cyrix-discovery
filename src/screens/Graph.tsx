import { useMemo, useState } from 'react'
import { deptKey, discoveredDepartments } from '../org'
import { useStore } from '../store'
import type { GraphEdge } from '../types'
import { Card, Tag } from '../components/ui'
import { cyra } from '../tokens'

// The company knowledge graph — entirely emergent. Nodes are teams the
// interviews revealed (plus the people who revealed them); edges are the
// dependencies those conversations described. Nothing is predefined: an empty
// graph is the honest state until the first interview lands.

interface Node {
  key: string
  name: string
  interviewed: boolean // a team we've actually heard from
  personNames: string[]
}

export function GraphScreen({ onOpenPerson }: { onOpenPerson: (personId: string) => void }) {
  const { interviews, people } = useStore()
  const [focus, setFocus] = useState<string | null>(null)

  const departments = useMemo(() => discoveredDepartments(interviews), [interviews])

  // Edges from every completed interview, de-duplicated by unordered pair.
  const edges = useMemo(() => {
    const seen = new Set<string>()
    const out: GraphEdge[] = []
    for (const iv of Object.values(interviews)) {
      if (iv.status !== 'complete') continue
      for (const e of iv.edges) {
        const from = e.from.trim()
        const to = e.to.trim()
        if (!from || !to) continue
        const key = [deptKey(from), deptKey(to)].sort().join('~')
        if (seen.has(key)) continue
        seen.add(key)
        out.push({ from, to, label: e.label })
      }
    }
    return out
  }, [interviews])

  // Nodes: interviewed teams + any team merely named by someone else's interview.
  const nodes = useMemo(() => {
    const map = new Map<string, Node>()
    for (const d of departments) {
      map.set(d.key, {
        key: d.key,
        name: d.name,
        interviewed: true,
        personNames: d.personIds.map((id) => people[id]?.name ?? 'Someone').filter(Boolean),
      })
    }
    for (const e of edges) {
      for (const name of [e.from, e.to]) {
        const key = deptKey(name)
        if (!map.has(key)) map.set(key, { key, name: name.trim(), interviewed: false, personNames: [] })
      }
    }
    return [...map.values()]
  }, [departments, edges, people])

  const W = 860
  const H = 560
  const cx = W / 2
  const cy = H / 2
  const R = nodes.length <= 2 ? 120 : Math.min(220, 90 + nodes.length * 12)

  const pos = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>()
    nodes.forEach((n, i) => {
      if (nodes.length === 1) {
        map.set(n.key, { x: cx, y: cy })
        return
      }
      const angle = (i / nodes.length) * Math.PI * 2 - Math.PI / 2
      map.set(n.key, { x: cx + R * Math.cos(angle), y: cy + R * Math.sin(angle) })
    })
    return map
  }, [nodes, cx, cy, R])

  const focusEdges = focus
    ? edges.filter((e) => deptKey(e.from) === focus || deptKey(e.to) === focus)
    : edges

  const completedCount = Object.values(interviews).filter((i) => i.status === 'complete').length

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
      <header className="pt-8">
        <p className="eyebrow mb-2">Company knowledge graph</p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="font-display text-display2 font-heavy tracking-display text-ink">How Cyrix actually connects</h1>
          <span className="font-sans text-label text-neutral-700">
            {nodes.length} {nodes.length === 1 ? 'TEAM' : 'TEAMS'} · {edges.length} {edges.length === 1 ? 'RELATIONSHIP' : 'RELATIONSHIPS'} DISCOVERED
          </span>
        </div>
        <p className="mt-2 max-w-2xl text-bodySmall text-neutral-700">
          {completedCount === 0
            ? 'Nothing here is assumed. Teams appear as people describe them, and the lines between them are drawn only by what conversations actually reveal — handoffs, approvals, escalations, favours.'
            : 'Every conversation adds what the org chart doesn\'t show — where work, knowledge and favours actually flow. Click a team to isolate its connections.'}
        </p>
      </header>

      <Card className="mt-6 overflow-x-auto">
        {nodes.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-center">
            <svg width="120" height="60" viewBox="0 0 120 60" aria-hidden="true">
              <circle cx="20" cy="30" r="9" fill="none" stroke={cyra.neutral150} strokeWidth="2" strokeDasharray="3 3" />
              <circle cx="60" cy="30" r="9" fill="none" stroke={cyra.neutral150} strokeWidth="2" strokeDasharray="3 3" />
              <circle cx="100" cy="30" r="9" fill="none" stroke={cyra.neutral150} strokeWidth="2" strokeDasharray="3 3" />
              <line x1="29" y1="30" x2="51" y2="30" stroke={cyra.neutral150} strokeWidth="1.5" strokeDasharray="3 3" />
              <line x1="69" y1="30" x2="91" y2="30" stroke={cyra.neutral150} strokeWidth="1.5" strokeDasharray="3 3" />
            </svg>
            <p className="mt-6 max-w-sm text-bodySmall text-neutral-700">
              The organization has not spoken yet. The first completed conversation draws the first node.
            </p>
          </div>
        ) : (
          <>
            <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block w-full max-w-4xl" role="img" aria-label="Discovered relationships between teams">
              {focusEdges.map((e, i) => {
                const a = pos.get(deptKey(e.from))
                const b = pos.get(deptKey(e.to))
                if (!a || !b) return null
                const mx = (a.x + b.x) / 2 + (cy - (a.y + b.y) / 2) * 0.18
                const my = (a.y + b.y) / 2 + ((a.x + b.x) / 2 - cx) * 0.18
                const highlighted = Boolean(focus) && (deptKey(e.from) === focus || deptKey(e.to) === focus)
                return (
                  <g key={i}>
                    <path
                      d={`M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`}
                      fill="none"
                      stroke={highlighted ? cyra.ink : cyra.neutral300}
                      strokeWidth={highlighted ? 2 : 1.2}
                      opacity={focus && !highlighted ? 0.15 : 0.75}
                    />
                    {focus && highlighted && (
                      <text x={mx} y={my} textAnchor="middle" fontSize="10" fontFamily={cyra.fontBody} fill={cyra.neutral700}>
                        {e.label}
                      </text>
                    )}
                  </g>
                )
              })}
              {nodes.map((n) => {
                const p = pos.get(n.key)
                if (!p) return null
                const dim = focus !== null && focus !== n.key && !focusEdges.some((e) => deptKey(e.from) === n.key || deptKey(e.to) === n.key)
                const r = n.interviewed ? 30 : 24
                return (
                  <g
                    key={n.key}
                    opacity={dim ? 0.3 : 1}
                    className="cursor-pointer"
                    onClick={() => setFocus(focus === n.key ? null : n.key)}
                  >
                    <circle cx={p.x} cy={p.y} r={r} fill={n.interviewed ? cyra.ink : cyra.paper} stroke={n.interviewed ? cyra.ink : cyra.neutral150} strokeWidth="2" strokeDasharray={n.interviewed ? undefined : '3 3'} />
                    <text x={p.x} y={p.y + 3} textAnchor="middle" fontSize="8.5" fontWeight="600" fontFamily={cyra.fontBody} fill={n.interviewed ? cyra.paper : cyra.neutral700}>
                      {n.name.length > 11 ? n.name.slice(0, 10) + '…' : n.name}
                    </text>
                    <text x={p.x} y={p.y + r + 13} textAnchor="middle" fontSize="9" fontFamily={cyra.fontBody} fill={cyra.neutral500}>
                      {n.interviewed ? 'HEARD' : 'MENTIONED'}
                    </text>
                  </g>
                )
              })}
            </svg>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-neutral-150 pt-4">
              <div className="flex items-center gap-4 text-label text-neutral-700">
                <span className="inline-flex items-center gap-2">
                  <span className="h-3 w-3 border-2 border-ink bg-ink" /> interviewed
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-3 w-3 border-2 border-dashed border-neutral-150 bg-paper" /> mentioned, not yet heard
                </span>
              </div>
              {focus && (
                <button onClick={() => setFocus(null)} className="btn-secondary !px-4 !py-2 text-label">
                  Clear focus
                </button>
              )}
            </div>
          </>
        )}
      </Card>

      {/* Who we heard it from */}
      {departments.length > 0 && (
        <Card title="Teams discovered, and who described them" className="mt-4">
          <ul className="space-y-2">
            {departments.map((d) => (
              <li key={d.key} className="flex flex-wrap items-center gap-2 text-bodySmall">
                <span className="font-display font-heavy text-ink">{d.name}</span>
                <span className="text-neutral-700">—</span>
                {d.personIds.map((id) => (
                  <button
                    key={id}
                    onClick={() => onOpenPerson(id)}
                    className="font-sans text-label text-neutral-700 hover:underline"
                  >
                    {people[id]?.name ?? 'Someone'} →
                  </button>
                ))}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Cross-team patterns */}
      <Card title="Cross-team patterns the graph reveals" className="mt-4">
        <CrossPatterns />
      </Card>
    </main>
  )
}

function CrossPatterns() {
  const { interviews } = useStore()
  const completed = Object.values(interviews).filter((i) => i.status === 'complete')

  const patterns = useMemo(() => {
    const catCount = new Map<string, string[]>()
    for (const iv of completed) {
      const label = iv.departmentName?.trim() || iv.participant?.designation || 'A team'
      for (const p of iv.report?.painPoints ?? []) {
        const list = catCount.get(p.category) ?? []
        if (!list.includes(label)) list.push(label)
        catCount.set(p.category, list)
      }
    }
    return [...catCount.entries()]
      .filter(([, labels]) => labels.length >= 2)
      .sort((a, b) => b[1].length - a[1].length)
  }, [completed])

  if (patterns.length === 0) {
    return <p className="text-bodySmall italic text-neutral-700">Patterns appear once two or more teams share a pain category.</p>
  }
  return (
    <ul className="space-y-2">
      {patterns.map(([category, labels]) => (
        <li key={category} className="flex flex-wrap items-center gap-2 text-bodySmall">
          <Tag tone="warning">{category.toUpperCase()}</Tag>
          <span className="text-ink">appears independently in</span>
          {labels.map((l) => (
            <span key={l} className="font-sans text-label font-medium text-ink">{l}</span>
          ))}
          <span className="text-neutral-700">— a company-wide pattern, not a local complaint.</span>
        </li>
      ))}
    </ul>
  )
}
