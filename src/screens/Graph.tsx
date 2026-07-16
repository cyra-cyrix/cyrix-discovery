import { useMemo, useState } from 'react'
import { DEPARTMENTS, deptById } from '../data/departments'
import { useStore } from '../store'
import type { GraphEdge } from '../types'
import { Card, Tag } from '../components/ui'

// Company knowledge graph: departments on a circle, discovered relationships
// as edges. Heard departments glow; edges accumulate as interviews complete.

export function GraphScreen({ onOpenDept }: { onOpenDept: (id: string) => void }) {
  const { interviews } = useStore()
  const [focus, setFocus] = useState<string | null>(null)

  const edges = useMemo(() => {
    const seen = new Set<string>()
    const out: GraphEdge[] = []
    for (const iv of Object.values(interviews)) {
      if (iv.status !== 'complete') continue
      for (const e of iv.edges) {
        const valid = DEPARTMENTS.some((d) => d.id === e.from) && DEPARTMENTS.some((d) => d.id === e.to)
        if (!valid) continue
        const key = [e.from, e.to].sort().join('~')
        if (seen.has(key)) continue
        seen.add(key)
        out.push(e)
      }
    }
    return out
  }, [interviews])

  const W = 860
  const H = 620
  const cx = W / 2
  const cy = H / 2 + 6
  const R = 240

  const pos = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>()
    DEPARTMENTS.forEach((d, i) => {
      const angle = (i / DEPARTMENTS.length) * Math.PI * 2 - Math.PI / 2
      map.set(d.id, { x: cx + R * Math.cos(angle), y: cy + R * Math.sin(angle) })
    })
    return map
  }, [cx, cy])

  const focusEdges = focus ? edges.filter((e) => e.from === focus || e.to === focus) : edges

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
      <header className="pt-8">
        <p className="eyebrow mb-2">Company knowledge graph</p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="font-display text-3xl font-bold tracking-tight text-carbon">How Cyrix actually connects</h1>
          <span className="font-mono text-xs text-slate">{edges.length} RELATIONSHIPS DISCOVERED</span>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-slate">
          {edges.length === 0
            ? 'The fourteen departments are in place; the connections between them are not assumed. Every completed interview draws the edges the org chart doesn\'t show — where work, knowledge and favours actually flow.'
            : 'Every interview adds edges the org chart doesn\'t show — where work, knowledge and favours actually flow. Click a department to isolate its connections.'}
        </p>
      </header>

      <Card className="mt-6 overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block w-full max-w-4xl" role="img" aria-label="Knowledge graph of department relationships">
          {/* edges */}
          {focusEdges.map((e, i) => {
            const a = pos.get(e.from)
            const b = pos.get(e.to)
            if (!a || !b) return null
            const mx = (a.x + b.x) / 2 + (cy - (a.y + b.y) / 2) * 0.18
            const my = (a.y + b.y) / 2 + ((a.x + b.x) / 2 - cx) * 0.18
            const highlighted = focus && (e.from === focus || e.to === focus)
            return (
              <g key={i}>
                <path
                  d={`M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`}
                  fill="none"
                  stroke={highlighted ? '#14b8a3' : '#9fb8b3'}
                  strokeWidth={highlighted ? 2 : 1.2}
                  opacity={focus && !highlighted ? 0.15 : 0.75}
                />
                {focus && highlighted && (
                  <text x={mx} y={my} textAnchor="middle" fontSize="10" fontFamily="IBM Plex Mono" fill="#27403c">
                    {e.label}
                  </text>
                )}
              </g>
            )
          })}
          {/* nodes */}
          {DEPARTMENTS.map((d) => {
            const p = pos.get(d.id)
            if (!p) return null
            const iv = interviews[d.id]
            const heard = iv?.status === 'complete'
            const dim = focus !== null && focus !== d.id && !focusEdges.some((e) => e.from === d.id || e.to === d.id)
            return (
              <g
                key={d.id}
                opacity={dim ? 0.3 : 1}
                className="cursor-pointer"
                onClick={() => setFocus(focus === d.id ? null : d.id)}
                onDoubleClick={() => onOpenDept(d.id)}
              >
                <circle cx={p.x} cy={p.y} r={heard ? 30 : 25} fill={heard ? '#0e5a52' : '#ffffff'} stroke={heard ? '#14b8a3' : '#cfd9d6'} strokeWidth="2" />
                <text x={p.x} y={p.y + 3} textAnchor="middle" fontSize="9" fontWeight="600" fontFamily="IBM Plex Sans" fill={heard ? '#ffffff' : '#5d7370'}>
                  {d.short}
                </text>
                {heard && (
                  <text x={p.x} y={p.y + 44} textAnchor="middle" fontSize="9" fontFamily="IBM Plex Mono" fill="#8aa09c">
                    HEARD
                  </text>
                )}
              </g>
            )
          })}
        </svg>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-porcelain-200 pt-3">
          <div className="flex items-center gap-4 text-xs text-slate">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full border-2 border-pulse-500 bg-petrol-700" /> interviewed
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full border-2 border-porcelain-300 bg-white" /> not yet heard
            </span>
          </div>
          {focus && (
            <button onClick={() => setFocus(null)} className="btn-ghost !px-3 !py-1 text-xs">
              Clear focus: {deptById(focus).name}
            </button>
          )}
        </div>
      </Card>

      {/* Cross-department patterns */}
      <Card title="Cross-department patterns the graph reveals" className="mt-4">
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
      for (const p of iv.report?.painPoints ?? []) {
        const list = catCount.get(p.category) ?? []
        if (!list.includes(iv.departmentId)) list.push(iv.departmentId)
        catCount.set(p.category, list)
      }
    }
    return [...catCount.entries()]
      .filter(([, depts]) => depts.length >= 2)
      .sort((a, b) => b[1].length - a[1].length)
  }, [completed])

  if (patterns.length === 0) {
    return <p className="text-sm italic text-slate">Patterns appear once two or more departments share a pain category.</p>
  }
  return (
    <ul className="space-y-2.5">
      {patterns.map(([category, depts]) => (
        <li key={category} className="flex flex-wrap items-center gap-2 text-sm">
          <Tag tone="amber">{category.toUpperCase()}</Tag>
          <span className="text-carbon">appears independently in</span>
          {depts.map((d) => (
            <span key={d} className="font-mono text-[11px] font-medium text-petrol-700">{deptById(d).short}</span>
          ))}
          <span className="text-slate">— a company-wide pattern, not a local complaint.</span>
        </li>
      ))}
    </ul>
  )
}
