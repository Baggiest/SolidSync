import { useState } from 'react'
import type { DragEvent } from 'react'
import type { PartInfo, SectionInfo, SyncState } from '@solidsync/shared'
import { DownloadBadge, SyncBadge, WorkBadge } from './badges'
import { IconDownload, IconFile, IconFolder, IconStop } from './icons'
import { formatSince } from '../lib/format'
import { downloadPercent, versionDownloadStatus } from '../lib/status'
import { cancelDownload, downloadVersionNow, useClientState, useDownloads } from '../lib/store'

const GRID =
  'grid-cols-[minmax(130px,110px)_minmax(160px,1fr)_80px_84px_150px_110px_150px_110px]'

export function PartTable(props: {
  section: SectionInfo
  selectedPartId: string | null
  syncState: SyncState
  onPick: (partId: string) => void
  onDropVersion: (part: PartInfo, filePath: string) => void
  onError: (msg: string) => void
}) {
  const [draggingRow, setDraggingRow] = useState<string | null>(null)
  const downloaded = useClientState().downloaded
  const inFlight = useDownloads()

  if (props.section.parts.length === 0) {
    return (
      <div className="flex h-44 flex-col items-center justify-center gap-2 text-sm text-zinc-500">
        <IconFolder className="h-8 w-8 text-zinc-700" />
        <span>Nothing here yet.</span>
        <span className="text-xs text-zinc-600">
          Drop a file and it becomes a part with an ID, a head version, and full history.
        </span>
      </div>
    )
  }

  const downloadHead = (part: PartInfo): void => {
    if (!part.head) return
    const head = part.head
    const version = part.versions.find((v) => v.id === head)
    void (async () => {
      const err = await downloadVersionNow({
        projectId: part.projectId,
        sectionId: part.sectionId,
        partId: part.id,
        versionId: head,
        fileName: version?.fileName ?? part.name
      })
      if (err) props.onError(err)
    })()
  }

  return (
    <div className="flex flex-col">
      <div
        className={`grid ${GRID} gap-2 border-b border-zinc-800 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500`}
      >
        <span>Part ID</span>
        <span>File</span>
        <span>Head</span>
        <span>Sync</span>
        <span>Work</span>
        <span>Local</span>
        <span>Modified</span>
        <span>By</span>
      </div>

      {props.section.parts.map((part) => {
        const selected = part.id === props.selectedPartId
        const dragging = draggingRow === part.id
        const headStatus = versionDownloadStatus(part.head, downloaded, inFlight)
        const headProgress = part.head ? inFlight[part.head] : null
        return (
          <div
            key={part.id}
            onClick={() => props.onPick(part.id)}
            onDragOver={(e: DragEvent) => {
              if (e.dataTransfer.types.includes('Files')) {
                e.preventDefault()
                e.stopPropagation()
                setDraggingRow(part.id)
              }
            }}
            onDragLeave={() => setDraggingRow((r) => (r === part.id ? null : r))}
            onDrop={(e: DragEvent) => {
              e.preventDefault()
              e.stopPropagation()
              setDraggingRow(null)
              const f = e.dataTransfer.files?.[0]
              if (f) props.onDropVersion(part, window.solidsync.getPathForFile(f))
            }}
            className={`grid ${GRID} cursor-pointer items-center gap-2 border-b border-zinc-800/50 px-2 py-1.5 text-[13px] transition-colors ${
              dragging
                ? 'bg-sky-950/60 ring-1 ring-sky-800'
                : selected
                  ? 'bg-sky-950/30'
                  : 'hover:bg-zinc-800/50'
            }`}
            title="Drop a file onto this row to save a new version"
          >
            <span className="font-mono text-[12px] text-sky-400">{part.id}</span>
            <span className="flex min-w-0 items-center gap-1.5">
              <IconFile className="h-4 w-4 shrink-0 text-zinc-500" />
              <span className="truncate" title={part.name}>
                {part.name}
              </span>
              {part.versions.length > 1 && (
                <span className="shrink-0 rounded bg-zinc-800 px-1 text-[10px] text-zinc-500">
                  {part.versions.length}
                </span>
              )}
            </span>
            <span className="font-mono text-[11px] text-zinc-500">
              {part.head ? part.head.split('-').slice(1).join('-') || part.head : '—'}
            </span>
            <span>
              <SyncBadge state={props.syncState} />
            </span>
            <span>
              <WorkBadge status={part.workStatus} />
            </span>
            <span className="flex items-center gap-1.5">
              {part.head ? (
                headStatus === 'downloading' ? (
                  <>
                    <button
                      title="Cancel download"
                      onClick={(e) => {
                        e.stopPropagation()
                        cancelDownload(part.head!)
                      }}
                      className="rounded p-1 text-amber-400 hover:bg-zinc-800"
                    >
                      <IconStop className="h-3.5 w-3.5" />
                    </button>
                    <DownloadBadge
                      status="downloading"
                      percent={headProgress ? downloadPercent(headProgress) : undefined}
                    />
                  </>
                ) : headStatus === 'downloaded' ? (
                  <DownloadBadge status="downloaded" />
                ) : (
                  <>
                    <button
                      title="Download to my drive"
                      onClick={(e) => {
                        e.stopPropagation()
                        downloadHead(part)
                      }}
                      className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                    >
                      <IconDownload className="h-3.5 w-3.5" />
                    </button>
                    <DownloadBadge status="not-downloaded" />
                  </>
                )
              ) : (
                <span className="text-zinc-600">—</span>
              )}
            </span>
            <span className="text-zinc-400">{formatSince(part.lastModified)}</span>
            <span className="truncate text-zinc-400">{part.lastModifiedBy}</span>
          </div>
        )
      })}
    </div>
  )
}

export function DropHint({ visible }: { visible: boolean }) {
  if (!visible) return null
  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-sky-950/20 backdrop-blur-[1px]">
      <div className="rounded-lg border-2 border-dashed border-sky-600 bg-zinc-900/90 px-6 py-4 text-center">
        <div className="text-lg font-semibold text-sky-300">Drop to throw it in</div>
        <div className="mt-1 text-xs text-zinc-400">The file becomes a part with a 6-digit ID</div>
      </div>
    </div>
  )
}