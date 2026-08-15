import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import { VERSION } from '@solidsync/shared'
import type { UpdateState } from '@solidsync/shared'

// Wraps electron-updater's autoUpdater into a tiny state machine the renderer
// reads via IPC. The state lives here in the main process so the About modal
// just reflects it; the GUI never decides anything about the update itself.
//
// Auto-updates only exist in packaged builds (electron-updater needs the
// app-update.yml electron-builder writes into the app resources). In dev we
// report a 'not-packaged' phase so the button doesn't pretend to work.

let state: UpdateState = { phase: 'idle', currentVersion: VERSION }
let notify: (s: UpdateState) => void = () => undefined

function setState(partial: Partial<UpdateState>): UpdateState {
  state = { ...state, ...partial }
  notify(state)
  return state
}

export function getUpdateState(): UpdateState {
  return state
}

export function subscribeUpdater(cb: (s: UpdateState) => void): void {
  notify = cb
  notify(state)
}

function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg.includes('No latest release available')) {
    return 'No published version found on GitHub yet.'
  }
  return 'Couldn\'t reach GitHub. Check that this machine has internet access.'
}

export function initUpdater(): void {
  if (!app.isPackaged) {
    setState({ phase: 'not-packaged' })
    return
  }
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('checking-for-update', () => setState({ phase: 'checking' }))
  autoUpdater.on('update-available', (info) =>
    setState({ phase: 'available', availableVersion: info.version })
  )
  autoUpdater.on('update-not-available', () => setState({ phase: 'current' }))
  autoUpdater.on('download-progress', (p) =>
    setState({ phase: 'downloading', percent: Math.round(p.percent) })
  )
  autoUpdater.on('update-downloaded', () => setState({ phase: 'downloaded' }))
  autoUpdater.on('error', (err) => setState({ phase: 'error', error: friendlyError(err) }))
}

export async function checkForUpdate(): Promise<UpdateState> {
  if (!app.isPackaged) return state
  setState({ phase: 'checking' })
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    setState({ phase: 'error', error: friendlyError(err) })
  }
  return state
}

export async function downloadUpdate(): Promise<UpdateState> {
  if (!app.isPackaged) return state
  try {
    await autoUpdater.downloadUpdate()
  } catch (err) {
    setState({ phase: 'error', error: friendlyError(err) })
  }
  return state
}

export function installUpdate(): void {
  if (!app.isPackaged) return
  autoUpdater.quitAndInstall()
}