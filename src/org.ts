// ---------------------------------------------------------------------------
// The emergent organization. Nothing here is predefined: departments, their
// people and their relationships are all derived from completed interviews.
// ---------------------------------------------------------------------------

import type { Interview, Invite, Person, PersonStatus } from './types'

/** Normalisation key for free-text department names ("Revive Lab " ≡ "revive lab"). */
export const deptKey = (name: string): string => name.trim().toLowerCase()

export interface DiscoveredDepartment {
  key: string
  name: string // first-seen display casing
  personIds: string[]
  interviewCount: number
}

/** Departments that have actually been discovered through interviews. */
export function discoveredDepartments(interviews: Record<string, Interview>): DiscoveredDepartment[] {
  const map = new Map<string, DiscoveredDepartment>()
  for (const iv of Object.values(interviews)) {
    if (iv.status !== 'complete' || !iv.departmentName) continue
    const key = deptKey(iv.departmentName)
    if (!key) continue
    const existing = map.get(key)
    if (existing) {
      existing.personIds.push(iv.personId)
      existing.interviewCount++
    } else {
      map.set(key, { key, name: iv.departmentName.trim(), personIds: [iv.personId], interviewCount: 1 })
    }
  }
  return [...map.values()].sort((a, b) => b.interviewCount - a.interviewCount)
}

/** Display label for the team an interview belongs to. */
export function interviewDeptLabel(iv: Interview | undefined): string {
  return iv?.departmentName?.trim() || 'Team not yet identified'
}

export function personStatus(
  personId: string,
  interviews: Record<string, Interview>,
  invites: Record<string, Invite>,
): PersonStatus {
  const iv = interviews[personId]
  if (iv?.status === 'complete') return 'complete'
  if (iv && (iv.status === 'in_progress' || iv.status === 'generating')) return 'in_progress'
  const hasActive = Object.values(invites).some((i) => i.personId === personId && i.status === 'active' && !i.completedAt)
  return hasActive ? 'invited' : 'not_invited'
}

/** Latest invite issued to a person (if any). */
export function latestInviteFor(personId: string, invites: Record<string, Invite>): Invite | undefined {
  let latest: Invite | undefined
  for (const inv of Object.values(invites)) {
    if (inv.personId !== personId) continue
    if (!latest || inv.createdAt > latest.createdAt) latest = inv
  }
  return latest
}

/** A person auto-created when an interview starts without an existing record. */
export function personFromContext(
  id: string,
  ctx: { name: string; designation: string; department: string; stateBranch: string },
): Person {
  return {
    id,
    name: ctx.name.trim() || 'Name withheld',
    designation: ctx.designation.trim(),
    email: '',
    phone: '',
    state: ctx.stateBranch.trim(),
    reportingManager: '',
    department: ctx.department.trim(),
    createdAt: Date.now(),
  }
}
