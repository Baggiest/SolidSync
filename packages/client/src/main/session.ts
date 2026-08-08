import path from 'node:path'
import { SyncService } from './client/sync'
import type { AppConfig } from '@solidgit/shared'

/**
 * One client instance: a SyncService toward the configured server. The server
 * itself runs as a separate headless program (`solidgit-server`) on the shop
 * network and is never started by the GUI.
 */
export class Session {
  sync: SyncService | null = null

  async boot(config: AppConfig, userDataRoot: string): Promise<void> {
    await this.stop()

    this.sync = new SyncService(config.name, path.join(userDataRoot, 'mirror'))
    this.sync.setEndpoint(config.serverIp, config.port)
    await this.sync.start()
  }

  async stop(): Promise<void> {
    this.sync?.stop()
    this.sync = null
  }
}