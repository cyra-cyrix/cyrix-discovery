import { useState } from 'react'
import { useStore } from '../store'
import { Tag } from '../components/ui'

const MODELS = [
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8 — deepest interviewer (recommended)' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 — fast + sharp' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 — economical' },
]

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { settings, setSettings, resetAll } = useStore()
  const [apiKey, setApiKey] = useState(settings.apiKey)
  const [model, setModel] = useState(settings.model)
  const [confirmReset, setConfirmReset] = useState(false)

  function save() {
    setSettings({ apiKey: apiKey.trim(), model })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-carbon/40 p-4 pt-[10vh]" role="dialog" aria-modal="true" aria-label="Settings" onClick={onClose}>
      <div className="card w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-carbon">Settings</h2>
          <Tag tone={settings.apiKey ? 'pulse' : 'neutral'}>{settings.apiKey ? 'LIVE AI ENABLED' : 'DEMO MODE'}</Tag>
        </div>

        <label className="eyebrow mb-1.5 block" htmlFor="api-key">Anthropic API key</label>
        <input
          id="api-key"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-ant-…"
          autoComplete="off"
          className="w-full rounded-lg border border-porcelain-300 bg-white px-3 py-2.5 font-mono text-sm focus:border-petrol-500"
        />
        <p className="mt-1.5 text-xs leading-relaxed text-slate">
          Stored only in this browser (localStorage); calls go directly from your browser to the Claude API.
          Leave empty to use the built-in demo interviewer.
        </p>

        <label className="eyebrow mb-1.5 mt-4 block" htmlFor="model">Interview model</label>
        <select
          id="model"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="w-full rounded-lg border border-porcelain-300 bg-white px-3 py-2.5 text-sm focus:border-petrol-500"
        >
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>

        <div className="mt-5 flex items-center justify-between gap-3">
          {confirmReset ? (
            <button
              onClick={() => { resetAll(); setConfirmReset(false); onClose() }}
              className="rounded-lg border border-signal-100 bg-signal-50 px-3 py-2 text-xs font-medium text-signal-600"
            >
              Really clear all interviews? (archived, not destroyed)
            </button>
          ) : (
            <button onClick={() => setConfirmReset(true)} className="text-xs text-slate underline-offset-2 hover:underline">
              Clear all interview data
            </button>
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-ghost">Cancel</button>
            <button onClick={save} className="btn-primary">Save</button>
          </div>
        </div>
      </div>
    </div>
  )
}
