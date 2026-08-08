import { useClientState } from '../lib/store'
import { IconWarning } from './icons'

/** Unmissable disconnected state (spec §9): a giant bar, not a subtle icon. */
export function ConnectBanner() {
  const { connection, appConfig } = useClientState()

  if (connection === 'online' || connection === 'connecting') {
    if (connection === 'connecting') {
      return (
        <div className="flex h-9 shrink-0 items-center gap-2 bg-amber-900 px-4 text-sm text-amber-100">
          <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-amber-300" />
          Working out the connection&hellip; try the Sync button if this hangs.
        </div>
      )
    }
    return null
  }

  const target =
    appConfig.mode === 'host' ? 'this machine' : `${appConfig.serverIp}:${appConfig.port}`

  return (
    <div className="flex h-16 shrink-0 items-center gap-3 overflow-hidden bg-red-700 px-4 text-red-50">
      <span className="text-4xl font-black leading-none">!</span>
      <div className="min-w-0">
        <div className="text-base font-bold leading-tight">Disconnected — nothing is syncing</div>
        <div className="truncate text-sm text-red-200">
          Can&rsquo;t reach the org at {target}. Fix the connection, then hit Sync.
        </div>
      </div>
      <div className="ml-auto flex items-center gap-1 text-sm text-red-200">
        <IconWarning className="h-4 w-4" /> Check your network
      </div>
    </div>
  )
}