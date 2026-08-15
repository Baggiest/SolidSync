import { useState } from 'react'
import { VERSION } from '@solidsync/shared'
import { Modal } from './Modal'
import { useClientState } from '../lib/store'
import { IconExternal } from './icons'

// Skeleton links/credits — fill in the real ones before shipping.
const LINKS = {
  github: 'https://github.com/baggiest/solidsync',
  linkedin: 'https://www.linkedin.com/in/YOUR-HANDLE-HERE'
}
const LICENSE = 'MIT License'
const CREDITS =
  'SolidSync is built as a free, open-source side project. Thanks and contributor credits go here.'

export function InfoModal(props: { onClose: () => void }) {
  const { health } = useClientState()
  const [notice, setNotice] = useState<string | null>(null)

  const serverVersion = health?.version ?? null
  const open = (url: string): void => void window.solidsync.openExternal(url)

  const updateNote = (): void => {
    setNotice("Automatic updates aren't wired up yet. Grab the latest build from the GitHub page.")
  }

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
            <button
              onClick={updateNote}
              className="rounded-md border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
              title="Update the client"
            >
              Update
            </button>
          </div>
          <div className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2">
            <div>
              <div className="text-sm text-zinc-200">Shop server</div>
              <div className="font-mono text-xs text-zinc-500">
                {serverVersion ? `v${serverVersion}` : 'not connected'}
              </div>
            </div>
            <button
              onClick={updateNote}
              className="rounded-md border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
              title="Update the server"
            >
              Update
            </button>
          </div>
        </div>
        {notice && <p className="mt-2 text-xs text-zinc-500">{notice}</p>}
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