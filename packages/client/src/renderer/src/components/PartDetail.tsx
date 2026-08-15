import { useState } from 'react'
import type { OrgSnapshot, PartInfo, WorkStatus } from '@solidsync/shared'
import { IconCheck, IconDownload, IconExternal, IconFile, IconFolderOpen, IconStop, IconX } from './icons'
import { formatClock, formatSize } from '../lib/format'
import { findPart } from '../lib/selectors'
import { versionDownloadStatus } from '../lib/status'
import { useClientState, useDownloads } from '../lib/store'
import { DownloadBadge } from './badges'
import { ProgressBar } from './ProgressBar'

export default function PartDetail(props: {
  part: PartInfo | null
  org: OrgSnapshot | null
  onSetWork: (partId: string, status: WorkStatus) => void
  onSetHead: (partId: string, versionId: string) => void
  onSetParent: (partId: string, parentId: string | null) => void
  onSetName: (partId: string, name: string) => void
  onOpenVersion: (part: PartInfo, versionId: string) => void
  onRevealVersion: (part: PartInfo, versionId: string) => void
  onDownloadVersion: (part: PartInfo, versionId: string) => void
  onCancelDownload: (versionId: string) => void
  onClose: () => void
}) {
  const [editingName, setEditingName] = useState(false)
  const { part } = props
  const downloaded = useClientState().downloaded
  const inFlight = useDownloads()

  if (!part) {
    return (
      <aside className="flex w-80 shrink-0 flex-col border-l border-zinc-800 bg-zinc-950/60 p-4">
        <div className="text-xs leading-5 text-zinc-500">
          Pick a part to see its version history, work status, and head version.
        </div>
      </aside>
    )
  }

  const parent = part.parentId ? findPart(props.org, part.parentId) : null
  const versions = [...part.versions].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
  const headStatus = versionDownloadStatus(part.head, downloaded, inFlight)
  const headProgress = part.head ? inFlight[part.head] : null

  const disabledBtn = 'disabled:opacity-40 disabled:cursor-not-allowed'

  return (
    <aside className="flex w-80 shrink-0 flex-col overflow-hidden border-l border-zinc-800 bg-zinc-950/60">
      <div className="border-b border-zinc-800/70 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-mono text-sm text-sky-400">{part.id}</div>
            {editingName ? (
              <input
                autoFocus
                defaultValue={part.name}
                onBlur={(e) => {
                  setEditingName(false)
                  const v = e.target.value.trim()
                  if (v && v !== part.name) props.onSetName(part.id, v)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const v = (e.target as HTMLInputElement).value.trim()
                    if (v && v !== part.name) props.onSetName(part.id, v)
                    setEditingName(false)
                  }
                }}
                className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-sm text-zinc-100"
              />
            ) : (
              <div
                className="mt-0.5 cursor-pointer text-sm font-medium text-zinc-100 hover:text-sky-300"
                title="Rename (not the file)"
                onClick={() => setEditingName(true)}
              >
                {part.name}
              </div>
            )}
          </div>
          <div className="flex gap-1">
            {part.head &&
              (headStatus === 'downloading' && headProgress ? (
                <button
                  className="rounded p-1.5 text-amber-400 hover:bg-zinc-800"
                  title="Cancel download"
                  onClick={() => props.onCancelDownload(part.head!)}
                >
                  <IconStop className="h-4 w-4" />
                </button>
              ) : headStatus === 'not-downloaded' ? (
                <button
                  className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                  title="Download head version"
                  onClick={() => props.onDownloadVersion(part, part.head!)}
                >
                  <IconDownload className="h-4 w-4" />
                </button>
              ) : null)}
            <button
              className={`rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 ${disabledBtn}`}
              disabled={headStatus !== 'downloaded'}
              title={
                headStatus === 'downloaded'
                  ? 'Show head version in file browser'
                  : 'Download the head version first'
              }
              onClick={() => {
                if (part.head) props.onRevealVersion(part, part.head)
              }}
            >
              <IconFolderOpen className="h-4 w-4" />
            </button>
            <button
              className={`rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 ${disabledBtn}`}
              disabled={headStatus !== 'downloaded'}
              title={headStatus === 'downloaded' ? 'Open head version' : 'Download the head version first'}
              onClick={() => {
                if (part.head) props.onOpenVersion(part, part.head)
              }}
            >
              <IconExternal className="h-4 w-4" />
            </button>
            <span className="mx-0.5 h-4 w-px bg-zinc-800" />
            <button
              className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              title="Close panel"
              onClick={props.onClose}
            >
              <IconX className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
              Parent
            </div>
            <select
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 text-zinc-200"
              value={part.parentId ?? ''}
              onChange={(e) => props.onSetParent(part.id, e.target.value || null)}
            >
              <option value="">No parent</option>
              {props.org?.projects.flatMap((p) => p.sections.flatMap((s) => s.parts))
                .filter((p) => p.id !== part.id)
                .slice(0, 400)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id} {p.name}
                  </option>
                ))}
            </select>
            {parent && <div className="mt-1 truncate text-[11px] text-zinc-500">of {parent.part.name}</div>}
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
              Current version
            </div>
            <div className="mt-1.5 font-mono text-zinc-300">
              {part.head ? part.head.split('-').slice(1).join('-') || part.head : '—'}
            </div>
            <div className="text-[11px] text-zinc-500">
              {part.versions.find((v) => v.id === part.head)
                ? `${part.versions.find((v) => v.id === part.head)?.submittedBy}, ${formatClock(
                    part.versions.find((v) => v.id === part.head)?.submittedAt ?? ''
                  )}`
                : ''}
            </div>
          </div>
        </div>
      </div>

      <div className="border-b border-zinc-800 px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
          Work status
        </div>
        <div className="mt-2 flex gap-2">
          {(['green', 'yellow', 'red'] as WorkStatus[]).map((s) => {
            const active = part.workStatus === s
            const dot =
              s === 'green' ? 'bg-green-500' : s === 'yellow' ? 'bg-yellow-400' : 'bg-red-500'
            const label = s === 'green' ? 'Clear' : s === 'yellow' ? 'Ask first' : 'Do not touch'
            return (
              <button
                key={s}
                onClick={() => props.onSetWork(part.id, s)}
                className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 text-xs transition-colors ${
                  active ? 'border-zinc-500 bg-zinc-800 text-zinc-100' : 'border-zinc-800 text-zinc-500 hover:border-zinc-600'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${dot}`} />
                {label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex items-center justify-between px-4 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
          Version history
        </span>
        <span className="text-[11px] text-zinc-600">
          {versions.length} save{versions.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto border-t border-zinc-800 px-2 pb-4">
        {versions.length === 0 && (
          <p className="px-2 py-3 text-xs text-zinc-500">No versions saved yet.</p>
        )}
        {versions.map((v) => {
          const isHead = v.id === part.head
          const status = versionDownloadStatus(v.id, downloaded, inFlight)
          const progress = inFlight[v.id]
          return (
            <div
              key={v.id}
              className={`mt-1 rounded-md border px-2 py-1.5 ${
                isHead ? 'border-emerald-900 bg-emerald-950/20' : 'border-zinc-800/70'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <IconFile className="h-3.5 w-3.5 text-zinc-500" />
                <span className="min-w-0 flex-1 truncate text-xs text-zinc-200">{v.fileName}</span>
                {isHead && (
                  <span className="flex items-center gap-0.5 rounded bg-emerald-900/60 px-1 py-0.5 text-[10px] font-semibold text-emerald-300">
                    <IconCheck className="h-3 w-3" />
                    Head
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
                <span className="font-mono">{v.id.split('-').slice(1).join('-')}</span>
                <span>{formatClock(v.submittedAt)}</span>
                <span>by {v.submittedBy}</span>
                <span>{formatSize(v.size)}</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <DownloadBadge status={status} />
                {status === 'downloading' && progress && (
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <ProgressBar
                        verb="Downloading"
                        fileName={v.fileName}
                        sent={progress.sent}
                        total={progress.total}
                      />
                    </div>
                    <button
                      className="shrink-0 rounded border border-zinc-700 px-1.5 py-0.5 text-[11px] text-amber-300 hover:bg-zinc-800"
                      onClick={() => props.onCancelDownload(v.id)}
                    >
                      Cancel
                    </button>
                  </div>
                )}
                {status !== 'downloading' && (
                  <div className="ml-auto flex gap-1">
                    {status === 'not-downloaded' && (
                      <button
                        className="rounded border border-zinc-700 px-1.5 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-800"
                        onClick={() => props.onDownloadVersion(part, v.id)}
                      >
                        Download
                      </button>
                    )}
                    <button
                      disabled={status !== 'downloaded'}
                      className={`rounded border border-zinc-700 px-1.5 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-800 ${disabledBtn}`}
                      onClick={() => props.onOpenVersion(part, v.id)}
                    >
                      Open
                    </button>
                    <button
                      disabled={status !== 'downloaded'}
                      className={`rounded border border-zinc-700 px-1.5 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-800 ${disabledBtn}`}
                      title={status === 'downloaded' ? 'Show in file browser' : 'Download the file first'}
                      onClick={() => props.onRevealVersion(part, v.id)}
                    >
                      Show in file browser
                    </button>
                    {!isHead && (
                      <button
                        className="rounded border border-zinc-700 px-1.5 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-800"
                        onClick={() => props.onSetHead(part.id, v.id)}
                      >
                        Make head
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </aside>
  )
}
