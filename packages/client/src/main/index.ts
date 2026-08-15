import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import path from 'node:path'
import iconPath from '../../build/icon.png?asset'
import { ConfigStore } from './config'
import { Session } from './session'
import { TlsTrust, fetchServerCa } from './tls'
import type { AppConfig, ClientState, DownloadProgress, UploadProgress, WorkStatus } from '@solidsync/shared'
import { DEFAULT_PORT } from '@solidsync/shared'
import { DownloadCancelledError } from './client/sync'

const session = new Session()
const configStore = new ConfigStore()
let mainWindow: BrowserWindow | null = null
let currentConfig: AppConfig | null = null
let pendingTrust: { pem: string; fingerprint: string } | null = null
const userDataRoot = (): string => app.getPath('userData')

function buildState(): ClientState {
  const cfg = currentConfig ?? { configured: false, name: '', serverIp: '', port: 0, useTls: false }
  const sync = session.sync?.info
  let health = null as ClientState['health']
  let org = null as ClientState['org']
  let connection = 'offline' as ClientState['connection']
  let syncState = 'out-of-sync' as ClientState['syncState']
  let error = null as string | null
  let serverRev = null as number | null
  let downloaded = [] as string[]
  if (sync) {
    health = sync.health
    org = sync.org
    connection = sync.connection
    syncState = sync.syncState
    error = sync.error
    serverRev = sync.serverRev
    downloaded = sync.downloaded
  }
  return {
    appConfig: cfg, health, org, connection, syncState, error, serverRev,
    downloaded,
    mirrorRoot: session.sync?.mirrorRootDisplay() ?? null
  }
}

function pushState(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app:state', buildState())
  }
}

function pushUploadProgress(p: UploadProgress): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app:upload', p)
  }
}

function pushDownloadProgress(p: DownloadProgress): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app:download', p)
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    title: 'SolidSync',
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 600,
    backgroundColor: '#18181b',
    icon: iconPath,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

async function boot(config?: AppConfig): Promise<void> {
  const cfg = config ?? (await configStore.load())
  currentConfig = cfg
  if (cfg.configured) {
    await session.boot(cfg, userDataRoot())
  } else {
    await session.stop()
  }
  pushState()
}

async function stop(): Promise<void> {
  await session.stop()
}

// ---- IPC ---------------------------------------------------------------------

async function requireOnline(): Promise<Session> {
  if (!session.sync) throw new Error('Not connected. Finish setup first.')
  return session
}

ipcMain.handle('app:getState', () => buildState())

ipcMain.handle('onboarding:save', async (_e, cfg: AppConfig) => {
  const clean: AppConfig = {
    configured: true,
    name: String(cfg.name ?? '').trim() || 'someone',
    port: Math.max(1, Math.min(65535, Number(cfg.port) || DEFAULT_PORT)),
    serverIp: cleanerIp(String(cfg.serverIp ?? '').trim()),
    useTls: cfg.useTls === true
  }
  await configStore.save(clean)
  await boot(clean)
  return true
})

// ---- TLS trust (TOFU) ------------------------------------------------------

ipcMain.handle('tls:probe', async (_e, o: { serverIp: string; port: number }) => {
  try {
    const { pem, fingerprint } = await fetchServerCa(String(o.serverIp ?? '').trim(), Number(o.port) || 3443)
    pendingTrust = { pem, fingerprint }
    return { ok: true, fingerprint }
  } catch (err) {
    pendingTrust = null
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('tls:trust', async () => {
  if (!pendingTrust) throw new Error('no server identity pending — run tls:probe first')
  await new TlsTrust(userDataRoot()).storeCaPem(pendingTrust.pem)
  pendingTrust = null
  return true
})

ipcMain.handle('tls:clear', async () => {
  await new TlsTrust(userDataRoot()).clearCaPem()
  return true
})

ipcMain.handle('tls:status', async () => new TlsTrust(userDataRoot()).status())

ipcMain.handle('action:createProject', async (_e, name: string) => {
  const s = await requireOnline()
  if (typeof name !== 'string' || !name.trim()) throw new Error('project name required')
  await s.sync!.createProject(name.trim())
  pushState()
})

ipcMain.handle('action:createSection', async (_e, projectId: string, name: string) => {
  const s = await requireOnline()
  await s.sync!.createSection(projectId, String(name).trim() || 'New section')
  pushState()
})

ipcMain.handle('action:archiveProject', async (_e, projectId: string) => {
  const s = await requireOnline()
  if (typeof projectId !== 'string' || !projectId) throw new Error('project required')
  await s.sync!.archiveProject(projectId)
  pushState()
})

ipcMain.handle('action:unarchiveProject', async (_e, projectId: string) => {
  const s = await requireOnline()
  if (typeof projectId !== 'string' || !projectId) throw new Error('project required')
  await s.sync!.unarchiveProject(projectId)
  pushState()
})

const uploadProgress = (fileName: string) => {
  let last = 0
  return (sent: number, total: number): void => {
    const now = Date.now()
    if (now - last < 100 && sent < total) return
    last = now
    pushUploadProgress({ fileName, sent, total, done: sent >= total })
  }
}

const downloadProgress = (versionId: string, fileName: string) => {
  let last = 0
  return (received: number, total: number): void => {
    const now = Date.now()
    if (now - last < 100) return
    last = now
    pushDownloadProgress({ versionId, fileName, sent: received, total, done: false })
  }
}

ipcMain.handle('action:throwIn', async (_e, opts: { projectId: string; sectionId: string; filePath: string; parentId?: string | null }) => {
  const s = await requireOnline()
  await s.sync!.throwIn(opts, uploadProgress(path.basename(opts.filePath)))
  pushState()
})

ipcMain.handle('action:saveVersion', async (_e, opts: { projectId: string; partId: string; filePath: string }) => {
  const s = await requireOnline()
  await s.sync!.saveVersion(opts, uploadProgress(path.basename(opts.filePath)))
  pushState()
})

ipcMain.handle('action:setHead', async (_e, partId: string, versionId: string) => {
  const s = await requireOnline()
  await s.sync!.setHead(partId, versionId)
  pushState()
})

ipcMain.handle('action:setWorkStatus', async (_e, partId: string, status: WorkStatus) => {
  const s = await requireOnline()
  await s.sync!.setWorkStatus(partId, status)
  pushState()
})

ipcMain.handle('action:setParent', async (_e, partId: string, parentId: string | null) => {
  const s = await requireOnline()
  await s.sync!.setParent(partId, parentId)
  pushState()
})

ipcMain.handle('action:setPartName', async (_e, partId: string, name: string) => {
  const s = await requireOnline()
  await s.sync!.setPartName(partId, String(name).trim())
  pushState()
})

ipcMain.handle('action:refresh', async () => {
  const s = await requireOnline()
  await s.sync!.refresh()
  pushState()
})

ipcMain.handle('action:openVersion', async (_e, opts: { projectId: string; sectionId: string; partId: string; versionId: string; fileName: string }) => {
  const s = await requireOnline()
  const p = await s.sync!.versionLocalPath(opts.projectId, opts.sectionId, opts.partId, opts.versionId, opts.fileName)
  if (!p) throw new Error('Download the file first')
  shell.openPath(p)
  pushState()
})

ipcMain.handle('action:revealVersion', async (_e, opts: { projectId: string; sectionId: string; partId: string; versionId: string; fileName: string }) => {
  const s = await requireOnline()
  const p = await s.sync!.versionLocalPath(opts.projectId, opts.sectionId, opts.partId, opts.versionId, opts.fileName)
  if (!p) throw new Error('Download the file first')
  shell.showItemInFolder(p)
  pushState()
})

ipcMain.handle('action:downloadVersion', async (_e, opts: { projectId: string; sectionId: string; partId: string; versionId: string; fileName: string }) => {
  const s = await requireOnline()
  const settle = (): void =>
    pushDownloadProgress({ versionId: opts.versionId, fileName: opts.fileName, sent: 0, total: 0, done: true })
  try {
    await s.sync!.downloadVersion(opts, downloadProgress(opts.versionId, opts.fileName))
  } catch (err) {
    settle()
    if (err instanceof DownloadCancelledError) {
      pushState()
      return
    }
    pushState()
    throw err
  }
  settle()
  pushState()
})

ipcMain.handle('action:cancelDownload', async (_e, versionId: string) => {
  const s = await requireOnline()
  s.sync!.cancelDownload(String(versionId ?? ''))
  pushState()
})

ipcMain.handle('action:revealRoot', async () => {
  const s = await requireOnline()
  shell.showItemInFolder(s.sync!.mirrorRootDisplay())
})

ipcMain.handle('action:pickFile', async () => {
  const win = mainWindow ?? undefined
  const res = await dialog.showOpenDialog(win!, {
    title: 'Pick a file to throw in',
    properties: ['openFile']
  })
  return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0]
})

function cleanerIp(ip: string): string {
  const lower = ip.toLowerCase()
  if (!lower || /^[a-z0-9.:]+$/.test(lower)) return lower
  return ip
}

// ---- app lifecycle -------------------------------------------------------------

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  void app.whenReady().then(async () => {
    createWindow()
    await boot()
    session.sync?.subscribe(() => pushState())
  })

  app.on('window-all-closed', () => {
    void Promise.resolve(stop())
    app.quit()
  })

  app.on('quit', () => {
    void session
  })

  app.on('will-quit', () => {
    void stop()
  })
}