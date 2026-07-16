import { useState } from 'react'
import { DEPARTMENTS } from '../data/departments'
import { generateInviteToken, inviteUrl } from '../invites'
import { useStore } from '../store'
import type { Invite } from '../types'
import { Card, Tag } from '../components/ui'

// Invitation Manager — one row per department. Generate, copy, regenerate and
// disable unique invitation links; completion is read from the interviews.

type RowStatus = 'not_invited' | 'pending' | 'disabled' | 'completed'

export function InvitesScreen() {
  const { invites, interviews, upsertInvite } = useStore()
  const [copiedToken, setCopiedToken] = useState<string | null>(null)

  // latest invite per department (by creation time)
  const latestByDept = new Map<string, Invite>()
  for (const inv of Object.values(invites)) {
    const cur = latestByDept.get(inv.departmentId)
    if (!cur || inv.createdAt > cur.createdAt) latestByDept.set(inv.departmentId, inv)
  }

  function rowStatus(deptId: string): { status: RowStatus; completedAt: number | null } {
    const interview = interviews[deptId]
    if (interview?.status === 'complete') return { status: 'completed', completedAt: interview.completedAt }
    const invite = latestByDept.get(deptId)
    if (!invite) return { status: 'not_invited', completedAt: null }
    if (invite.status === 'disabled') return { status: 'disabled', completedAt: null }
    return { status: 'pending', completedAt: null }
  }

  function generate(deptId: string) {
    // regenerating: disable the previous active link for this department first
    const previous = latestByDept.get(deptId)
    if (previous && previous.status === 'active') {
      upsertInvite({ ...previous, status: 'disabled' })
    }
    const invite: Invite = {
      token: generateInviteToken(),
      departmentId: deptId,
      createdAt: Date.now(),
      status: 'active',
      completedAt: null,
    }
    upsertInvite(invite)
    void copy(invite.token)
  }

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(inviteUrl(token))
      setCopiedToken(token)
      setTimeout(() => setCopiedToken(null), 1800)
    } catch {
      // clipboard unavailable — the link is still visible in the row
    }
  }

  function disable(invite: Invite) {
    upsertInvite({ ...invite, status: 'disabled' })
  }

  return (
    <main className="mx-auto max-w-4xl px-4 pb-16 sm:px-6">
      <header className="pt-8">
        <p className="eyebrow mb-2">Invitation manager</p>
        <h1 className="font-display text-3xl font-bold tracking-tight text-carbon">Invite department heads</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate">
          Each department head receives a unique link to the Discovery Conversation Portal. The link identifies
          the invitation only — participants confirm their department and context themselves. Note: until the
          backend exists, disabling a link takes effect on this device; treat links as private.
        </p>
      </header>

      <Card className="mt-6 !p-0">
        <ul className="divide-y divide-porcelain-200">
          {DEPARTMENTS.map((d) => {
            const { status, completedAt } = rowStatus(d.id)
            const invite = latestByDept.get(d.id)
            const active = invite && invite.status === 'active'
            return (
              <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
                <div className="min-w-[180px] flex-1">
                  <div className="font-display text-sm font-bold text-carbon">{d.name}</div>
                  {active && (
                    <div className="mt-0.5 select-all font-mono text-[11px] text-slate">#invite/{invite.token}</div>
                  )}
                </div>

                {status === 'completed' && (
                  <span className="flex items-center gap-2">
                    <Tag tone="pulse">COMPLETED</Tag>
                    {completedAt && (
                      <span className="font-mono text-[11px] text-slate">
                        {new Date(completedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                  </span>
                )}
                {status === 'pending' && <Tag tone="amber">PENDING</Tag>}
                {status === 'disabled' && <Tag tone="signal">DISABLED</Tag>}
                {status === 'not_invited' && <Tag>NOT INVITED</Tag>}

                <span className="flex items-center gap-2">
                  {active ? (
                    <>
                      <button onClick={() => void copy(invite.token)} className="btn-ghost !px-3 !py-1.5 text-xs">
                        {copiedToken === invite.token ? 'Copied ✓' : 'Copy link'}
                      </button>
                      <button onClick={() => generate(d.id)} className="btn-ghost !px-3 !py-1.5 text-xs">
                        Regenerate
                      </button>
                      <button onClick={() => disable(invite)} className="btn-ghost !px-3 !py-1.5 text-xs hover:!border-signal-500 hover:!text-signal-600">
                        Disable
                      </button>
                    </>
                  ) : (
                    <button onClick={() => generate(d.id)} className="btn-primary !px-3 !py-1.5 text-xs">
                      {status === 'not_invited' ? 'Generate invite link' : 'Generate new link'}
                    </button>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      </Card>
    </main>
  )
}
