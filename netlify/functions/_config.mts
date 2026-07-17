// runtime_mode — the M2 migration flag (plan §2): off → shadow → pilot → default.
// Held in a config blob so it can be changed WITHOUT a deploy (instant
// rollback tier 1); RUNTIME_MODE env var is the fallback default.

import { getStore } from '@netlify/blobs'

export type RuntimeMode = 'off' | 'shadow' | 'pilot' | 'default'
const VALID: RuntimeMode[] = ['off', 'shadow', 'pilot', 'default']

function store() {
  return getStore({ name: 'cyra-discovery-config', consistency: 'strong' })
}

export async function getRuntimeMode(): Promise<RuntimeMode> {
  const blob = (await store().get('runtime_mode', { type: 'json' })) as { mode?: string } | null
  const candidate = blob?.mode ?? Netlify.env.get('RUNTIME_MODE') ?? 'off'
  return VALID.includes(candidate as RuntimeMode) ? (candidate as RuntimeMode) : 'off'
}

export async function setRuntimeMode(mode: string): Promise<RuntimeMode> {
  if (!VALID.includes(mode as RuntimeMode)) throw new Error(`invalid runtime_mode: ${mode}`)
  await store().setJSON('runtime_mode', { mode, changed_at: Date.now() })
  return mode as RuntimeMode
}
