import type { SyncState, WorkStatus } from '@solidsync/shared'

export const WORK_META: Record<WorkStatus, { label: string; dot: string; ring: string; hint: string }> = {
  red: { label: 'Do not touch', dot: 'bg-red-500', ring: 'text-red-400', hint: 'Owner is mid-change — do not touch' },
  yellow: { label: 'Ask first', dot: 'bg-yellow-400', ring: 'text-yellow-400', hint: 'Ask the owner before working on this' },
  green: { label: 'Ready to work', dot: 'bg-green-500', ring: 'text-green-400', hint: 'Clear to work on' }
}

export const SYNC_META: Record<SyncState, { label: string; pill: string }> = {
  synced: { label: 'Current', pill: 'bg-emerald-950 text-emerald-400 border-emerald-800' },
  syncing: { label: 'Syncing', pill: 'bg-sky-950 text-sky-300 border-sky-800 animate-pulse' },
  'out-of-sync': { label: 'Out of sync', pill: 'bg-amber-950 text-amber-400 border-amber-800' },
  offline: { label: 'Offline', pill: 'bg-zinc-800 text-zinc-500 border-zinc-700' }
}