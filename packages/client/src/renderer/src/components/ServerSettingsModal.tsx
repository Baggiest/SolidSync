import { useState } from 'react'
import { Modal } from './Modal'
import { useClientState, doAction } from '../lib/store'

export function ServerSettingsModal(props: { onClose: () => void; onSaved: () => void }) {
  const { appConfig } = useClientState()
  const [name, setName] = useState(appConfig.name)
  const [serverIp, setServerIp] = useState(appConfig.serverIp)
  const [port, setPort] = useState(String(appConfig.port || 3020))
  const [useTls, setUseTls] = useState(appConfig.useTls === true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [trust, setTrust] = useState<string | null>(null)

  const save = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    const cfg = {
      configured: true,
      name: name.trim() || (appConfig.name || 'Mechanic'),
      serverIp: serverIp.trim() || appConfig.serverIp,
      port: Number(port) || appConfig.port || 3020,
      useTls
    }
    const err = await doAction(window.solidsync.saveOnboarding(cfg))
    setBusy(false)
    if (err) {
      setError(err)
      return
    }
    props.onSaved()
  }

  const submit = async (): Promise<void> => {
    setError(null)
    setTrust(null)
    if (useTls) {
      setBusy(true)
      const probe = await window.solidsync.tlsProbe({
        serverIp: serverIp.trim() || appConfig.serverIp,
        port: Number(port) || appConfig.port || 3020
      })
      setBusy(false)
      if (!probe.ok) {
        setError(`Couldn't reach the server over HTTPS: ${probe.error ?? 'unknown error'}`)
        return
      }
      setTrust(probe.fingerprint ?? '')
      return
    }
    await save()
  }

  const confirmTrust = async (): Promise<void> => {
    setTrust(null)
    await window.solidsync.tlsTrust()
    await save()
  }

  const forgetIdentity = async (): Promise<void> => {
    await window.solidsync.tlsClear()
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
        placeholder={useTls ? 'HTTPS port, default 3443' : 'Port, default 3020'}
      />

      <label className="mt-4 flex items-center gap-2 text-sm text-zinc-300">
        <input
          type="checkbox"
          checked={useTls}
          onChange={(e) => setUseTls(e.target.checked)}
          className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 accent-sky-600"
        />
        Use HTTPS (encrypted connection)
      </label>

      {error && (
        <div className="mt-3 rounded-md border border-red-900 bg-red-950 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      {trust !== null && (
        <div className="mt-3 rounded-xl border border-amber-800 bg-amber-950/60 p-4">
          <p className="text-sm font-semibold text-amber-200">Verify this server</p>
          <p className="mt-1 text-xs text-amber-200/80">
            First contact over HTTPS. Check the fingerprint against the server console, then trust it:
          </p>
          <p className="mt-2 break-all rounded bg-zinc-900 px-2 py-1.5 font-mono text-[11px] text-amber-100">
            {trust}
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={() => setTrust(null)}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              onClick={() => void confirmTrust()}
              className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-500"
            >
              Trust &amp; reconnect
            </button>
          </div>
        </div>
      )}

      <div className="mt-5 flex items-center justify-between gap-2">
        <button
          onClick={() => void forgetIdentity()}
          className="rounded-md border border-zinc-800 px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
          title="Delete this machine's pinned server certificate (re-prompts next time)"
        >
          Forget server identity
        </button>
        <div className="flex gap-2">
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
      </div>
    </Modal>
  )
}
