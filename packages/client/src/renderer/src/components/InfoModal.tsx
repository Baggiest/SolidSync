import { useState } from 'react'
import { VERSION } from '@solidsync/shared'
import { Modal } from './Modal'
import { useClientState, useUpdateState } from '../lib/store'
import { IconExternal } from './icons'

// Skeleton links/credits — fill in the real ones before shipping.
const LINKS = {
  github: 'https://github.com/baggiest/solidsync',
  linkedin: 'https://www.linkedin.com/in/manisohi'
}
const LICENSE = 'MIT License'
const CREDITS =
  'SolidSync is built as a free, open-source side project. Thanks and contributor credits go here.'

export function InfoModal(props: { onClose: () => void }) {
  const { health } = useClientState()
  const update = useUpdateState()
  const [busy, setBusy] = useState(false)

  const serverVersion = health?.version ?? null
  const open = (url: string): void => void window.solidsync.openExternal(url)

  const run = async (fn: () => Promise<unknown>): Promise<void> => {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  const checkNow = (): void => void run(() => window.solidsync.checkForUpdate())
  const downloadNow = (): void => void run(() => window.solidsync.downloadUpdate())

  const updateNote: string | null = (() => {
    switch (update.phase) {
      case 'current':
        return 'You\u2019re up to date.'
      case 'not-packaged':
        return 'Automatic updates are only available in the installed build.'
      case 'error':
        return update.error ?? 'Something went wrong while checking for updates.'
      case 'downloading':
        return update.percent !== undefined ? `Downloading\u2026 ${update.percent}%` : 'Downloading\u2026'
      default:
        return null
    }
  })()

  return (
    <Modal title="About SolidSync" wide onClose={props.onClose}>
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Versions</h3>
        <div className="mt-2 space-y-1.5">
          <div className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2">
            <div>
              <div className="text-sm text-zinc-200">SolidSync client</div>
              <div className="font-mono text-xs text-zinc-500">v{VERSION}</div>
            </div>
            {update.phase === 'downloaded' ? (
              <button
                onClick={() => void window.solidsync.installUpdate()}
                className="rounded-md border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                title="Restart SolidSync to finish the update"
              >
                Restart to update
              </button>
            ) : update.phase === 'available' ? (
              <button
                onClick={downloadNow}
                disabled={busy}
                className="rounded-md border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
                title="Download the new version"
              >
                {update.availableVersion ? `Update to v${update.availableVersion}` : 'Update'}
              </button>
            ) : (
              <button
                onClick={checkNow}
                disabled={busy || update.phase === 'checking' || update.phase === 'downloading' || update.phase === 'not-packaged'}
                className="rounded-md border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
                title="Check GitHub for a newer version"
              >
                {update.phase === 'checking'
                  ? 'Checking\u2026'
                  : update.phase === 'downloading'
                    ? 'Downloading\u2026'
                    : 'Check for updates'}
              </button>
            )}
          </div>
          <div className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2">
            <div>
              <div className="text-sm text-zinc-200">Shop server</div>
              <div className="font-mono text-xs text-zinc-500">
                {serverVersion ? `v${serverVersion}` : 'not connected'}
              </div>
            </div>
          </div>
        </div>
        {updateNote && <p className="mt-2 text-xs text-zinc-500">{updateNote}</p>}
      </section>

      <section className="mt-5">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">License</h3>
        <p className="mt-2 text-sm leading-5 text-zinc-400">
          SolidSync is free &amp; open-source software, released under the{' '}
          <span className="text-zinc-200">{LICENSE}</span>. The full license text lives in the repo.
        </p>
      </section>

      <section className="mt-5">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Links</h3>
        <div className="mt-2 space-y-1.5">
          <button
            onClick={() => open(LINKS.github)}
            className="flex w-full items-center justify-between rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
            title="Open the GitHub repository"
          >
            <span>GitHub</span>
            <IconExternal className="h-3.5 w-3.5 text-zinc-500" />
          </button>
          <button
            onClick={() => open(LINKS.linkedin)}
            className="flex w-full items-center justify-between rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
            title="Open LinkedIn"
          >
            <span>LinkedIn</span>
            <IconExternal className="h-3.5 w-3.5 text-zinc-500" />
          </button>
        </div>
      </section>

      <section className="mt-5">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Credits</h3>
        <p className="mt-2 text-sm leading-5 text-zinc-400">{CREDITS}</p>
      </section>
    </Modal>
  )
}