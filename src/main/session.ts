import path from 'node:path'
import { OrgStore } from './server/store'
import { createApp } from './server/app'
import { startHttp, lanIPs, type ServerHandle } from './server/http'
import { SyncService } from './client/sync'
import type { AppConfig } from '../shared/types'

/**
 * One instance of the app's runtime: in client mode a SyncService toward the
 * configured server; in host mode the server (SQLite + git repos + REST) plus a
 * SyncService pointed at itself over loopback, so the host sees its own org
 * through the same window.
 */
export class Session {
  sync: SyncService | null = null
  server: ServerHandle | null = null
  store: OrgStore | null = null
  hostAddress: string | null = null

  async boot(config: AppConfig, userDataRoot: string): Promise<void> {
    await this.stop()

    let targetIp = config.serverIp
    let targetPort = config.port

    if (config.mode === 'host') {
      const orgRoot = path.join(userDataRoot, 'org')
      this.store = await OrgStore.open(orgRoot, 'Shop')
      const port = config.port || 3020
      this.server = await startHttp(createApp(this.store), port, '0.0.0.0')
      this.hostAddress = `${this.firstLanIP()}:${this.server.port}`
      targetIp = '127.0.0.1'
      targetPort = this.server.port
    }

    this.sync = new SyncService(config.name, path.join(userDataRoot, 'mirror'))
    this.sync.setEndpoint(targetIp, targetPort)
    await this.sync.start()
  }

  async stop(): Promise<void> {
    this.sync?.stop()
    this.sync = null
    if (this.server) {
      try {
        await this.server.close()
      } catch {
        /* ignore */
      }
      this.server = null
    }
    if (this.store) {
      try {
        await this.store.close()
      } catch {
        /* ignore */
      }
      this.store = null
    }
  }

  private firstLanIP(): string {
    const ips = lanIPs()
    return ips.length > 0 ? ips[0] : '127.0.0.1'
  }
}