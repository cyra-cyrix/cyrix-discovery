import { useState } from 'react'
import { useStore } from '../store'
import { clearAdminToken } from '../api'
import { Tag } from '../components/ui'

const MODELS = [
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8 — deepest interviewer (recommended)' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 — fast + sharp' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 — economical' },
]

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { settings, setSettings, loadError } = useStore()
  const [model, setModel] = useState(settings.model)

  function save() {
    setSettings({ ...settings, model })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-dialog flex items-start justify-center bg-ink/60 p-4 pt-24" role="dialog" aria-modal="true" aria-label="Settings" onClick={onClose}>
      <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="font-display text-heading font-heavy text-ink">Settings</h2>
          <Tag tone={loadError ? 'error' : 'success'}>{loadError ? 'Server unreachable' : 'Connected'}</Tag>
        </div>

        <p className="text-bodySmall text-neutral-700">
          Discovery data is stored centrally, so every invitation and interview is shared across devices.
        </p>

        <label className="eyebrow mb-2 mt-6 block" htmlFor="model">Interview model</label>
        <select id="model" value={model} onChange={(e) => setModel(e.target.value)} className="input">
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
        <p className="mt-2 text-label uppercase tracking-label text-neutral-500">
          The Anthropic key is held by the server, never by a browser.
        </p>

        <div className="mt-6 flex items-center justify-between gap-4">
          <button onClick={() => { clearAdminToken(); window.location.reload() }} className="btn-tertiary">
            Sign out
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary">Cancel</button>
            <button onClick={save} className="btn-primary">Save</button>
          </div>
        </div>
      </div>
    </div>
  )
}
