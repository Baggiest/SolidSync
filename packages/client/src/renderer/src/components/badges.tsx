import type { DownloadStatus, SyncState, WorkStatus } from '@solidsync/shared'
import { SYNC_META, WORK_META } from '../lib/status'

export function WorkBadge({ status }: { status: WorkStatus }) {
  const meta = WORK_META[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium ${meta.ring}`}
      title={meta.hint}
    >
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  )
}

export function SyncBadge({ state }: { state: SyncState }) {
  const meta = SYNC_META[state]
  return <span className={`inline-flex rounded border px-1.5 py-0.5 text-[11px] font-medium ${meta.pill}`}>{meta.label}</span>
}

const DOWNLOAD_META: Record<DownloadStatus, { label: string; pill: string }> = {
  downloaded: { label: 'On drive', pill: 'bg-emerald-950 text-emerald-400 border-emerald-800' },
  downloading: { label: 'Downloading', pill: 'bg-sky-950 text-sky-300 border-sky-800 animate-pulse' },
  'not-downloaded': { label: 'Not on drive', pill: 'bg-zinc-900 text-zinc-500 border-zinc-800' },
  failed: { label: 'Failed', pill: 'bg-red-950 text-red-400 border-red-800' }
}

export function DownloadBadge({ status, percent }: { status: DownloadStatus; percent?: number }) {
  const meta = DOWNLOAD_META[status]
  const label =
    status === 'downloading' && percent != null ? `Downloading ${percent}%` : meta.label
  return <span className={`inline-flex rounded border px-1.5 py-0.5 text-[11px] font-medium ${meta.pill}`}>{label}</span>
}

export function WorkStatusControl({ status, onChange, disabled }: { status: WorkStatus; onChange: (s: WorkStatus) => void; disabled?: boolean }) {
  const options: WorkStatus[] = ['green', 'yellow', 'red']
  return (
    <div className="flex items-center gap-1">
      {options.map((opt) => {
        const active = status === opt
        const meta = WORK_META[opt]
        return (
          <button
            key={opt}
            disabled={disabled}
            title={meta.hint}
            onClick={() => onChange(opt)}
            className={`inline-flex h-6 items-center gap-1 rounded border px-2 text-[11px] font-medium transition-colors ${
              active
                ? `border-zinc-500 ${meta.ring} bg-zinc-800`
                : 'border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'
            }`}
          >
            <span className={`inline-block h-2 w-2 rounded-full ${meta.dot}`} />
            {opt.charAt(0).toUpperCase()}
          </button>
        )
      })}
    </div>
  )
}