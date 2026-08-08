import { useState } from 'react'
import type { AppMode } from '../../../shared/types'
import { doAction } from '../lib/store'

export default function Onboarding() {
  const [name, setName] = useState('')
  const [mode, setMode] = useState<AppMode>('host')
  const [serverIp, setServerIp] = useState('')
  const [port, setPort] = useState('3020')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    const err = await doAction(
      window.solidgit.saveOnboarding({
        configured: true,
        name: name.trim() || 'Mechanic',
        mode,
        serverIp: mode === 'client' ? (serverIp.trim() || '127.0.0.1') : '0.0.0.0',
        port: mode === 'client' ? Number(port) || 3020 : 3020
      })
    )
    setBusy(false)
    if (err) {
      setError(err)
      return
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-zinc-900 p-6">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100">SolidGit</h1>
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

        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            onClick={() => setMode('host')}
            className={`rounded-xl border p-4 text-left transition-colors ${
              mode === 'host'
                ? 'border-sky-700 bg-sky-950/40'
                : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
            }`}
          >
            <div className="text-sm font-semibold text-zinc-100">Host the org</div>
            <div className="mt-1 text-xs leading-5 text-zinc-400">
              Run the shop server on this machine. Teammates connect to it.
            </div>
          </button>
          <button
            onClick={() => setMode('client')}
            className={`rounded-xl border p-4 text-left transition-colors ${
              mode === 'client'
                ? 'border-sky-700 bg-sky-950/40'
                : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
            }`}
          >
            <div className="text-sm font-semibold text-zinc-100">Join an org</div>
            <div className="mt-1 text-xs leading-5 text-zinc-400">
              Point this app at the team&rsquo;s server.
            </div>
          </button>
        </div>

        {mode === 'client' && (
          <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
            <input
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-sky-600"
              placeholder="Host IP, e.g. 192.168.1.50"
              value={serverIp}
              onChange={(e) => setServerIp(e.target.value)}
            />
            <input
              className="mt-2 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-sky-600"
              placeholder="Port, default 3020"
              value={port}
              onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))}
            />
          </div>
        )}

        {error && (
          <div className="mt-3 rounded-md border border-red-900 bg-red-950 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        <button
          onClick={() => void submit()}
          disabled={busy}
          className="mt-5 w-full rounded-md bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
        >
          {busy ? 'Starting…' : 'Open SolidGit'}
        </button>
      </div>
    </div>
  )
}