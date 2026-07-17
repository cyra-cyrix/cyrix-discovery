import { useMemo, useState } from 'react'
import { generateInviteToken, inviteUrl } from '../invites'
import { latestInviteFor, personStatus } from '../org'
import { useStore } from '../store'
import type { Invite, Person, PersonStatus } from '../types'
import { newPersonId } from '../types'
import { Card, Tag } from '../components/ui'
import type { Tone } from '../components/ui'

// People — the primary entity. Invitations are issued to people; the
// department field is optional here because it is discovered by the interview.

const STATUS_TAG: Record<PersonStatus, { label: string; tone: Tone }> = {
  complete: { label: 'Interviewed', tone: 'success' },
  in_progress: { label: 'In conversation', tone: 'warning' },
  invited: { label: 'Invited', tone: 'warning' },
  not_invited: { label: 'Not invited', tone: 'neutral' },
}

export function PeopleScreen({ onOpenPerson }: { onOpenPerson: (personId: string) => void }) {
  const { people, interviews, invites, upsertPerson, removePerson, upsertInvite } = useStore()
  const [editing, setEditing] = useState<Person | null>(null)
  const [adding, setAdding] = useState(false)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [writeError, setWriteError] = useState<string | null>(null)

  const roster = useMemo(() => {
    const list = Object.values(people).sort((a, b) => a.createdAt - b.createdAt)
    const q = query.trim().toLowerCase()
    if (!q) return list
    return list.filter((p) =>
      `${p.name} ${p.designation} ${p.department} ${p.state} ${p.email} ${p.reportingManager}`.toLowerCase().includes(q),
    )
  }, [people, query])

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(inviteUrl(token))
      setCopiedToken(token)
      setTimeout(() => setCopiedToken(null), 1800)
    } catch {
      // clipboard unavailable — the token is visible in the row
    }
  }

  async function generate(personId: string) {
    setWriteError(null)
    try {
      const previous = latestInviteFor(personId, invites)
      if (previous && previous.status === 'active') await upsertInvite({ ...previous, status: 'disabled' })
      const invite: Invite = {
        token: generateInviteToken(),
        personId,
        createdAt: Date.now(),
        status: 'active',
        completedAt: null,
      }
      await upsertInvite(invite)
      void copy(invite.token)
    } catch (e) {
      setWriteError(e instanceof Error ? e.message : 'Could not save the invitation.')
    }
  }

  async function guard(fn: () => Promise<void>) {
    setWriteError(null)
    try { await fn() } catch (e) {
      setWriteError(e instanceof Error ? e.message : 'Could not save. Check your connection and try again.')
    }
  }

  const interviewedCount = Object.values(interviews).filter((i) => i.status === 'complete').length

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
      <header className="pt-8">
        <p className="eyebrow mb-2">People</p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-display2 font-heavy tracking-display text-ink">Who we're listening to</h1>
            <p className="mt-2 max-w-2xl text-bodySmall text-neutral-700">
              Invite people, not org boxes. Each person receives a unique link; their department, their
              dependencies and the shape of the organization emerge from the conversation itself.
            </p>
          </div>
          <button onClick={() => { setAdding(true); setEditing(null) }} className="btn-primary">
            Add a person
          </button>
        </div>
        <p className="mt-4 font-sans text-label uppercase tracking-label text-neutral-700">
          {Object.keys(people).length} people · {interviewedCount} interviewed
        </p>
      </header>

      {writeError && (
        <div className="mt-6 border border-hairline border-error bg-neutral-050 px-4 py-2 text-label text-error" role="alert">
          {writeError}
        </div>
      )}

      {(adding || editing) && (
        <PersonForm
          person={editing}
          onCancel={() => { setAdding(false); setEditing(null) }}
          onSave={(p) => { void guard(async () => { await upsertPerson(p); setAdding(false); setEditing(null) }) }}
        />
      )}

      {Object.keys(people).length > 0 && (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people — name, designation, department, state…"
          className="input mt-6 max-w-sm"
          aria-label="Search people"
        />
      )}

      {roster.length === 0 ? (
        <Card className="mt-6">
          <p className="py-6 text-center text-bodySmall text-neutral-700">
            {Object.keys(people).length === 0
              ? 'No one has been invited yet. Add the first person and the organization begins to emerge.'
              : 'No one matches that search.'}
          </p>
        </Card>
      ) : (
        <Card className="mt-6 !p-0">
          <ul className="divide-y divide-neutral-150">
            {roster.map((p) => {
              const status = personStatus(p.id, interviews, invites)
              const invite = latestInviteFor(p.id, invites)
              const activeInvite = invite && invite.status === 'active' && !invite.completedAt ? invite : null
              const iv = interviews[p.id]
              const discovered = iv?.departmentName?.trim()
              return (
                <li key={p.id} className="px-6 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                    <div className="min-w-[200px] flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-bodySmall font-heavy text-ink">{p.name}</span>
                        <Tag tone={STATUS_TAG[status].tone}>{STATUS_TAG[status].label}</Tag>
                        {status === 'complete' && iv?.completedAt && (
                          <span className="font-sans text-label text-neutral-700">
                            {new Date(iv.completedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        )}
                      </div>
                      <div className="mt-px text-label text-neutral-700">
                        {[p.designation, p.state].filter(Boolean).join(' · ')}
                        {p.reportingManager && <span> · reports to {p.reportingManager}</span>}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-label">
                        {discovered ? (
                          <span className="text-ink">
                            <span className="font-sans text-label uppercase tracking-label text-neutral-500">discovered team · </span>
                            {discovered}
                          </span>
                        ) : p.department ? (
                          <span className="text-neutral-700">
                            <span className="font-sans text-label uppercase tracking-label text-neutral-500">stated · </span>
                            {p.department}
                          </span>
                        ) : (
                          <span className="italic text-neutral-500">team to be discovered</span>
                        )}
                        {(p.email || p.phone) && (
                          <span className="text-neutral-500">{[p.email, p.phone].filter(Boolean).join(' · ')}</span>
                        )}
                      </div>
                      {activeInvite && (
                        <div className="mt-2 select-all font-sans text-label text-neutral-500">#invite/{activeInvite.token}</div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {status === 'complete' ? (
                        <button onClick={() => onOpenPerson(p.id)} className="btn-primary !px-4 !py-2 text-label">
                          Open report
                        </button>
                      ) : activeInvite ? (
                        <>
                          <button onClick={() => void copy(activeInvite.token)} className="btn-secondary !px-4 !py-2 text-label">
                            {copiedToken === activeInvite.token ? 'Copied ✓' : 'Copy link'}
                          </button>
                          <button onClick={() => void generate(p.id)} className="btn-secondary !px-4 !py-2 text-label">
                            Regenerate
                          </button>
                          <button
                            onClick={() => void guard(async () => { await upsertInvite({ ...activeInvite, status: 'disabled' }) })}
                            className="btn-secondary !px-4 !py-2 text-label hover:!border-error hover:!text-error"
                          >
                            Disable
                          </button>
                        </>
                      ) : (
                        <button onClick={() => void generate(p.id)} className="btn-primary !px-4 !py-2 text-label">
                          {invite ? 'Generate new link' : 'Generate invite link'}
                        </button>
                      )}
                      <button
                        onClick={() => { setEditing(p); setAdding(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                        className="btn-secondary !px-4 !py-2 text-label"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => { if (confirm(`Remove ${p.name}? This deletes their interview from shared storage.`)) void guard(async () => { await removePerson(p.id) }) }}
                        className="p-2 text-neutral-500 transition-colors hover:text-error"
                        aria-label={`Remove ${p.name}`}
                        title="Remove person"
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
    </main>
  )
}

// ---------- Add / edit ----------

function PersonForm({ person, onSave, onCancel }: {
  person: Person | null
  onSave: (p: Person) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(person?.name ?? '')
  const [designation, setDesignation] = useState(person?.designation ?? '')
  const [email, setEmail] = useState(person?.email ?? '')
  const [phone, setPhone] = useState(person?.phone ?? '')
  const [state, setState] = useState(person?.state ?? '')
  const [reportingManager, setReportingManager] = useState(person?.reportingManager ?? '')
  const [department, setDepartment] = useState(person?.department ?? '')

  const ready = name.trim() && designation.trim()

  return (
    <Card className="mt-6">
      <h2 className="font-display text-bodySmall font-heavy text-ink">{person ? `Edit ${person.name}` : 'Add a person'}</h2>
      <form
        className="mt-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!ready) return
          onSave({
            id: person?.id ?? newPersonId(),
            name: name.trim(),
            designation: designation.trim(),
            email: email.trim(),
            phone: phone.trim(),
            state: state.trim(),
            reportingManager: reportingManager.trim(),
            department: department.trim(),
            createdAt: person?.createdAt ?? Date.now(),
          })
        }}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} className="input" required /></Field>
          <Field label="Designation"><input value={designation} onChange={(e) => setDesignation(e.target.value)} className="input" placeholder="e.g. Warehouse Manager" required /></Field>
          <Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" /></Field>
          <Field label="Phone"><input value={phone} onChange={(e) => setPhone(e.target.value)} className="input" /></Field>
          <Field label="State"><input value={state} onChange={(e) => setState(e.target.value)} className="input" placeholder="e.g. Kerala" /></Field>
          <Field label="Reporting manager" hint="optional"><input value={reportingManager} onChange={(e) => setReportingManager(e.target.value)} className="input" /></Field>
          <Field label="Department" hint="optional — discovered in the interview">
            <input value={department} onChange={(e) => setDepartment(e.target.value)} className="input" placeholder="Leave blank if unsure" />
          </Field>
        </div>
        <div className="mt-6 flex items-center gap-2">
          <button type="submit" disabled={!ready} className="btn-primary">{person ? 'Save changes' : 'Add person'}</button>
          <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        </div>
      </form>
    </Card>
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
