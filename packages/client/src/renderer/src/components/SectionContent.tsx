import { useRef, useState } from 'react'
import type { DragEvent } from 'react'
import type { ProjectInfo, SectionInfo, SyncState } from '@solidsync/shared'
import { PartTable, DropHint } from './PartTable'
import { Modal } from './Modal'
import { IconPlus } from './icons'
import { ProgressBar } from './ProgressBar'
import { doAction, useUploadProgress } from '../lib/store'

interface PendingDrop {
  filePath: string
  fileName: string
}

export default function SectionContent(props: {
  project: ProjectInfo
  section: SectionInfo
  selectedPartId: string | null
  syncState: SyncState
  onPickPart: (partId: string) => void
  onError: (msg: string) => void
}) {
  const [dragOver, setDragOver] = useState(false)
  const [pending, setPending] = useState<PendingDrop | null>(null)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const dragCounter = useRef(0)
  const upload = useUploadProgress()

  const showDrag = (): void => {
    dragCounter.current += 1
    setDragOver(true)
  }
  const hideDrag = (): void => {
    dragCounter.current = Math.max(0, dragCounter.current - 1)
    if (dragCounter.current === 0) setDragOver(false)
  }

  const flushPending = async (parentId: string | null): Promise<void> => {
    if (!pending) return
    setBusy(true)
    const err = await doAction(
      window.solidsync.throwIn({
        projectId: props.project.id,
        sectionId: props.section.id,
        filePath: pending.filePath,
        parentId
      })
    )
    setBusy(false)
    setPending(null)
    if (err) props.onError(err)
  }

  return (
    <div
      className="relative flex min-w-0 flex-1 flex-col"
      onDragEnter={(e) => {
        if (e.dataTransfer.types?.includes('Files')) {
          e.preventDefault()
          showDrag()
        }
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types?.includes('Files')) {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
        }
      }}
      onDragLeave={hideDrag}
      onDrop={(e: DragEvent) => {
        e.preventDefault()
        hideDrag()
        const file = e.dataTransfer.files?.[0]
        if (file) setPending({ filePath: window.solidsync.getPathForFile(file), fileName: file.name })
      }}
    >
      <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-[11px] text-zinc-600">
            Project <span className="text-zinc-500">/ {props.project.name}</span>
          </div>
          <h2 className="truncate text-sm font-semibold text-zinc-100">{props.section.name}</h2>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => {
              void (async () => {
                const p = await window.solidsync.pickFile()
                if (p) {
                  const sep = p.replace(/\\/g, '/')
                  setPending({ filePath: p, fileName: sep.split('/').pop() ?? p })
                }
              })()
            }}
            className="inline-flex h-7 items-center gap-1.5 rounded border border-zinc-700 px-2 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            <IconPlus className="h-4 w-4" />
            Throw in
          </button>
        </div>
      </div>

      <div className="relative flex-1 overflow-y-auto p-3">
        <PartTable
          section={props.section}
          selectedPartId={props.selectedPartId}
          syncState={props.syncState}
          onPick={props.onPickPart}
          onError={props.onError}
          onDropVersion={async (part, filePath) => {
            const sep = filePath.replace(/\\/g, '/')
            setSaving(sep.split('/').pop() ?? filePath)
            const err = await doAction(
              window.solidsync.saveVersion({
                projectId: props.project.id,
                partId: part.id,
                filePath
              })
            )
            setSaving(null)
            if (err) props.onError(err)
          }}
        />
        <DropHint visible={dragOver} />
        {saving && (
          <div className="absolute bottom-3 left-3 right-3 z-40 rounded-md border border-zinc-700 bg-zinc-900/95 p-3 shadow-xl">
            {upload && upload.fileName === saving ? (
              <ProgressBar fileName={upload.fileName} sent={upload.sent} total={upload.total} />
            ) : (
              <div className="text-xs text-zinc-400">
                Saving <span className="font-mono text-zinc-100">{saving}</span>…
              </div>
            )}
          </div>
        )}
      </div>

      {pending && (
        <Modal title={busy ? 'Uploading…' : 'New part'} onClose={() => setPending(null)} wide>
          {busy ? (
            <div className="flex flex-col gap-3">
              <div className="text-sm text-zinc-300">
                <span className="font-mono text-zinc-100">{pending.fileName}</span> is being thrown into{' '}
                <span className="text-zinc-100">{props.section.name}</span>.
              </div>
              {upload && upload.fileName === pending.fileName && (
                <ProgressBar fileName={upload.fileName} sent={upload.sent} total={upload.total} />
              )}
            </div>
          ) : (
            <>
              <div className="text-sm text-zinc-300">
                <span className="font-mono text-zinc-100">{pending.fileName}</span> is being thrown into{' '}
                <span className="text-zinc-100">{props.section.name}</span>.
                <p className="mt-2 text-xs text-zinc-500">
                  Is it a subsystem or subpart of another part? You can set parents later too.
                </p>
              </div>
              <div className="mt-3 flex max-h-56 flex-col gap-1 overflow-y-auto">
                <button
                  disabled={busy}
                  onClick={() => void flushPending(null)}
                  className="rounded-md border border-zinc-700 px-2 py-1.5 text-left text-sm text-zinc-200 hover:border-zinc-500 disabled:opacity-40"
                >
                  No — just throw it in
                </button>
                {props.section.parts.map((p) => (
                  <button
                    key={p.id}
                    disabled={busy}
                    onClick={() => void flushPending(p.id)}
                    className="flex items-center gap-2 rounded-md border border-zinc-800 px-2 py-1.5 text-left text-sm text-zinc-300 hover:border-zinc-500 disabled:opacity-40"
                  >
                    <span className="font-mono text-sky-400">{p.id}</span>
                    <span className="truncate">{p.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  )
}