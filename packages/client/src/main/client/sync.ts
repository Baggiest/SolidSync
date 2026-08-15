import path from 'node:path'
import type { Agent } from 'undici'
import { SolidSyncApi } from './api'
import { Mirror, type DesiredFile } from './mirror'
import type { ConnectionState, Health, OrgSnapshot, SyncState } from '@solidsync/shared'

export type { OrgSnapshot }

export interface SyncStateInfo {
  connection: ConnectionState
  syncState: SyncState
  org: OrgSnapshot | null
  serverRev: number | null
  error: string | null
  health: Health | null
}

type Listener = (state: SyncStateInfo) => void

const POLL_MS = 3000

/**
 * Owns the client's relationship with the server. Polls /api/health on a fixed
 * interval (plain REST — no websockets), refetches the org snapshot whenever
 * the server rev moves, and reconciles the local isomorphic-git mirror.
 */
export class SyncService {
  private api: SolidSyncApi
  private mirror: Mirror
  private timer: NodeJS.Timeout | null = null
  private polling = false
  private refreshing = false
  private listeners = new Set<Listener>()

  info: SyncStateInfo = {
    connection: 'connecting',
    syncState: 'syncing',
    org: null,
    serverRev: null,
    error: null,
    health: null
  }

  constructor(
    userName: string,
    mirrorRoot: string
  ) {
    this.mirrorRoot = mirrorRoot
    const base = ''
    this.api = new SolidSyncApi(base)
    this.api.user = userName
    this.mirror = new Mirror(mirrorRoot, userName)
  }

  // allowed to build after user set the endpoint
  setEndpoint(serverIp: string, port: number, useTls = false): void {
    this.api.baseUrl = `${useTls ? 'https' : 'http'}://${serverIp}:${port}`
  }

  /** Pin the API client to a CA-trusted TLS agent. Call before setEndpoint/start. */
  setTrust(dispatcher: Agent): void {
    this.api.dispatcher = dispatcher
  }

  // ---- event plumbing -------------------------------------------------------

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    fn(this.info)
    return () => this.listeners.delete(fn)
  }

  private emit(): void {
    for (const fn of this.listeners) fn({ ...this.info })
  }

  // ---- lifecycle --------------------------------------------------------------

  async start(): Promise<void> {
    await this.healthOnce(true)
    this.timer = setInterval(() => {
      void this.healthOnce(false)
    }, POLL_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private async healthOnce(force: boolean): Promise<void> {
    if (this.polling) return
    this.polling = true
    try {
      const health = await this.api.health()
      const wasOnline = this.info.connection === 'online'
      this.info.connection = 'online'
      this.info.health = health
      this.info.serverRev = health.rev
      this.info.error = null
      if (force || !wasOnline || health.rev !== this.info.health?.rev || this.info.org === null) {
        await this.refresh()
      }
      if (this.info.health?.rev === this.info.serverRev && this.info.org) {
        this.info.syncState = 'synced'
      }
    } catch (err) {
      this.info.connection = 'offline'
      this.info.syncState = 'out-of-sync'
      this.info.error = err instanceof Error ? err.message : String(err)
    } finally {
      this.polling = false
      this.emit()
    }
  }

  /** Fetch org + reconcile the mirror, regardless of rev diff. */
  async refresh(): Promise<void> {
    if (this.refreshing) return
    this.refreshing = true
    this.info.syncState = 'syncing'
    this.emit()
    try {
      const org = await this.api.getOrg()
      // The GUI reflects the server snapshot as-is; the mirror is just a cache.
      // Even if mirroring fails, the server stays the source of truth on screen.
      this.info.org = org
      this.info.serverRev = org.rev
      await this.reconcileMirror(org)
      this.info.syncState = 'synced'
      this.info.error = null
    } catch (err) {
      this.info.syncState = 'out-of-sync'
      this.info.error = err instanceof Error ? err.message : String(err)
    } finally {
      this.refreshing = false
      this.emit()
    }
  }

  private async reconcileMirror(org: OrgSnapshot): Promise<void> {
    // Mirror only what the server has: drop local projects that vanished server-side.
    const live = new Set(org.projects.map((p) => p.id))
    const local = await this.mirror.listProjects()
    for (const id of local) {
      if (!live.has(id)) await this.mirror.removeProject(id)
    }
    for (const project of org.projects) {
      await this.mirror.ensureProject(project.id)
      const desired = Mirror.desiredFiles(project)
      const index = await this.mirror.loadIndex(project.id)

      const have = new Set(Object.keys(index.files))
      const want = new Map<string, DesiredFile>()
      for (const f of desired) want.set(f.rel, f)

      for (const f of desired) {
        const known = index.files[f.rel]
        if (have.has(f.rel) && known?.versionId === f.versionId && known.size === f.size) continue
        const bytes = await this.api.downloadBytes(project.id, f.partId, f.versionId)
        await this.mirror.storeFile(project.id, f.rel, bytes, `Save a version of ${f.fileName}`)
        index.files[f.rel] = { versionId: f.versionId, size: f.size }
      }
      for (const rel of Object.keys(index.files)) {
        if (!want.has(rel)) {
          await this.mirror.removeFile(project.id, rel)
          delete index.files[rel]
        }
      }
      index.rev = org.rev
      await this.mirror.saveIndex(project.id, index)
    }
  }

  // ---- server actions (then refresh) -----------------------------------------

  private async act<T>(fn: () => Promise<T>): Promise<T> {
    const out = await fn()
    await this.refresh()
    return out
  }

  async createProject(name: string): Promise<void> {
    await this.act(() => this.api.createProject(name))
  }

  async createSection(projectId: string, name: string): Promise<void> {
    await this.act(() => this.api.createSection(projectId, name))
  }

  async throwIn(opts: { projectId: string; sectionId: string; filePath: string; parentId?: string | null }, onProgress?: (sent: number, total: number) => void): Promise<void> {
    await this.act(() => this.api.uploadNew(opts, onProgress))
  }

  async saveVersion(opts: { projectId: string; partId: string; filePath: string }, onProgress?: (sent: number, total: number) => void): Promise<void> {
    await this.act(() => this.api.saveVersion(opts, onProgress))
  }

  async setWorkStatus(partId: string, status: Parameters<SolidSyncApi['setWorkStatus']>[1]): Promise<void> {
    await this.act(() => this.api.setWorkStatus(partId, status))
  }

  async archiveProject(projectId: string): Promise<void> {
    await this.act(() => this.api.archiveProject(projectId))
  }

  async unarchiveProject(projectId: string): Promise<void> {
    await this.act(() => this.api.unarchiveProject(projectId))
  }

  async setHead(partId: string, versionId: string): Promise<void> {
    await this.act(() => this.api.setHead(partId, versionId))
  }

  async setParent(partId: string, parentId: string | null): Promise<void> {
    await this.act(() => this.api.setParent(partId, parentId))
  }

  async setPartName(partId: string, name: string): Promise<void> {
    await this.act(() => this.api.setPartName(partId, name))
  }

  /** Local absolute path of a mirrored version file (for "Open file"). */
  async versionLocalPath(projectId: string, sectionId: string, partId: string, versionId: string, fileName: string): Promise<string | null> {
    const { versionRelPath, partExt } = await import('./mirror')
    const rel = versionRelPath(sectionId, partId, versionId, partExt(fileName))
    const abs = this.mirror.abs(projectId, rel)
    if (await this.mirror.isTracked(projectId, rel)) return abs
    // not mirrored yet — fetch it on demand
    const bytes = await this.api.downloadBytes(projectId, partId, versionId)
    await this.mirror.storeFile(projectId, rel, bytes, `Open ${fileName}`)
    const index = await this.mirror.loadIndex(projectId)
    index.files[rel] = { versionId, size: bytes.length }
    await this.mirror.saveIndex(projectId, index)
    return abs
  }

  mirrorRootDisplay(): string {
    return path.resolve(this.mirrorRoot)
  }

  private mirrorRoot: string
}