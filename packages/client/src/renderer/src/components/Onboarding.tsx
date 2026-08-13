import { useState } from 'react'
import { doAction } from '../lib/store'

export default function Onboarding() {
  const [name, setName] = useState('')
  const [serverIp, setServerIp] = useState('')
  const [port, setPort] = useState('3020')
  const [useTls, setUseTls] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [trust, setTrust] = useState<string | null>(null) // pending server fingerprint

  const save = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    const err = await doAction(
      window.solidsync.saveOnboarding({
        configured: true,
        name: name.trim() || 'Mechanic',
        serverIp: serverIp.trim() || '127.0.0.1',
        port: Number(port) || 3020,
        useTls
      })
    )
    setBusy(false)
    if (err) setError(err)
  }

  const submit = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    setTrust(null)
    if (useTls) {
      const probe = await window.solidsync.tlsProbe({ serverIp: serverIp.trim() || '127.0.0.1', port: Number(port) || 3020 })
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

  return (
    <div className="flex h-full items-center justify-center bg-zinc-900 p-6">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100">SolidSync</h1>
        <p className="mt-1 text-sm text-zinc-400">
          The shop-floor part filer. One shared org, no logins, no VCS jargon.
        </p>

        <div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-950 p-5">
          <label className="block text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Your name
          </label>
          <input
            className="mt-1.5 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-sky-600"
            placeholder="e.g. Dana, the frame guy"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <p className="mt-1 text-[11px] text-zinc-500">
            No login — this just stamps your name on the versions you save.
          </p>
        </div>

        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
          <label className="block text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Server
          </label>
          <input
            className="mt-1.5 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-sky-600"
            placeholder="Host IP, e.g. 192.168.1.50"
            value={serverIp}
            onChange={(e) => setServerIp(e.target.value)}
          />
          <input
            className="mt-2 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-sky-600"
            placeholder={useTls ? 'HTTPS port, default 3443' : 'Port, default 3020'}
            value={port}
            onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))}
          />
          <label className="mt-2.5 flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={useTls}
              onChange={(e) => setUseTls(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 accent-sky-600"
            />
            Use HTTPS (encrypted connection)
          </label>
          <p className="mt-1.5 text-[11px] text-zinc-500">
            {useTls
              ? 'The server must be running with --tls. You will confirm its fingerprint once.'
              : 'Ask whoever runs the shop server for the IP and port.'}
          </p>
        </div>

        {error && (
          <div className="mt-3 rounded-md border border-red-900 bg-red-950 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        {trust !== null ? (
          <div className="mt-4 rounded-xl border border-amber-800 bg-amber-950/60 p-4">
            <p className="text-sm font-semibold text-amber-200">Verify this server</p>
            <p className="mt-1 text-xs text-amber-200/80">
              This is the first time you've connected to this server over HTTPS. Check its
              fingerprint against the one printed on the server console, then trust it:
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
                Trust &amp; connect
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => void submit()}
            disabled={busy}
            className="mt-5 w-full rounded-md bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
          >
            {busy ? 'Starting…' : 'Open SolidSync'}
          </button>
        )}
      </div>
    </div>
  )
}
