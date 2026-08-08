import { useState } from 'react'
import { Modal } from './Modal'
import { useClientState, doAction } from '../lib/store'

export function ServerSettingsModal(props: { onClose: () => void; onSaved: () => void }) {
  const { appConfig } = useClientState()
  const [name, setName] = useState(appConfig.name)
  const [serverIp, setServerIp] = useState(appConfig.serverIp)
  const [port, setPort] = useState(String(appConfig.port || 3020))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    const cfg = {
      configured: true,
      name: name.trim() || (appConfig.name || 'Mechanic'),
      serverIp: serverIp.trim() || appConfig.serverIp,
      port: Number(port) || appConfig.port || 3020
    }
    const err = await doAction(window.solidgit.saveOnboarding(cfg))
    setBusy(false)
    if (err) {
      setError(err)
      return
    }
    props.onSaved()
  }

  return (
    <Modal title="Server settings" onClose={props.onClose}>
      <label className="block text-xs font-semibold uppercase tracking-widest text-zinc-500">
        Your name
      </label>
      <input
        className="mt-1.5 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-sky-600"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <label className="mt-4 block text-xs font-semibold uppercase tracking-widest text-zinc-500">
        Server IP
      </label>
      <input
        className="mt-1.5 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-sky-600"
        value={serverIp}
        onChange={(e) => setServerIp(e.target.value)}
        placeholder="e.g. 192.168.1.50"
      />

      <label className="mt-4 block text-xs font-semibold uppercase tracking-widest text-zinc-500">
        Port
      </label>
      <input
        className="mt-1.5 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-sky-600"
        value={port}
        onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))}
      />

      {error && (
        <div className="mt-3 rounded-md border border-red-900 bg-red-950 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <button
          onClick={props.onClose}
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
        >
          Cancel
        </button>
        <button
          onClick={() => void submit()}
          disabled={busy}
          className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save & reconnect'}
        </button>
      </div>
    </Modal>
  )
}