// ---------------------------------------------------------------------------
// Invitation tokens.
//
// This module is the single seam between the UI and invitation validation.
// Today (no backend) tokens are self-validating: 11 random base36 characters
// plus one checksum character, so any device can reject malformed/mistyped
// links without shared state. Full lifecycle state (disabled, completed) is
// enforced where the invite record exists — the Innovation Team's browser.
//
// When a backend arrives, replace `lookupDecision` with an API call
// (GET /invites/:token → active | disabled | completed | unknown) and nothing
// else in the app needs to change.
// ---------------------------------------------------------------------------

import type { Invite } from './types'

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'
const RANDOM_LENGTH = 11

function checksumChar(body: string): string {
  let sum = 0
  for (let i = 0; i < body.length; i++) {
    sum = (sum + ALPHABET.indexOf(body[i]) * (i + 1)) % 36
  }
  return ALPHABET[sum]
}

export function generateInviteToken(): string {
  const bytes = new Uint8Array(RANDOM_LENGTH)
  crypto.getRandomValues(bytes)
  let body = ''
  for (const b of bytes) body += ALPHABET[b % 36]
  return body + checksumChar(body)
}

export function isValidTokenFormat(token: string): boolean {
  if (token.length !== RANDOM_LENGTH + 1) return false
  const body = token.slice(0, RANDOM_LENGTH)
  if ([...token].some((c) => !ALPHABET.includes(c))) return false
  return checksumChar(body) === token[RANDOM_LENGTH]
}

export type InviteDecision = 'accept' | 'invalid' | 'disabled' | 'completed'

/**
 * Decide whether a participant arriving with this token may start.
 * `invites` is whatever records this device knows about (localStorage today,
 * an API response later). Unknown-but-well-formed tokens are accepted, because
 * without a backend the participant's device cannot hold the issuing record.
 */
export function lookupDecision(token: string, invites: Record<string, Invite>): InviteDecision {
  if (!isValidTokenFormat(token)) return 'invalid'
  const invite = invites[token]
  if (!invite) return 'accept'
  if (invite.status === 'disabled') return 'disabled'
  if (invite.completedAt) return 'completed'
  return 'accept'
}

export function inviteUrl(token: string): string {
  return `${window.location.origin}${window.location.pathname}#invite/${token}`
}
