import path from 'node:path'
import { SyncService } from './client/sync'
import { TlsTrust, pinnedAgent } from './tls'
import type { AppConfig } from '@solidsync/shared'

/**
 * One client instance: a SyncService toward the configured server. The server
 * itself runs as a separate headless program (`solidsync-server`) on the shop
 * network and is never started by the GUI.
 */
export class Session {
  sync: SyncService | null = null
  trust: TlsTrust | null = null

  async boot(config: AppConfig, userDataRoot: string): Promise<void> {
    await this.stop()

    this.trust = new TlsTrust(userDataRoot)
    const caPem = config.useTls ? await this.trust.loadCaPem() : null

    this.sync = new SyncService(config.name, path.join(userDataRoot, 'mirror'))
    if (config.useTls && caPem) this.sync.setTrust(pinnedAgent(caPem))
    this.sync.setEndpoint(config.serverIp, config.port, config.useTls)
    await this.sync.start()
  }

  async stop(): Promise<void> {
    this.sync?.stop()
    this.sync = null
  }
}
