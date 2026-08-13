import { app } from 'electron'
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import type { AppConfig } from '@solidsync/shared'
import { DEFAULT_PORT } from '@solidsync/shared'

const DEFAULTS: AppConfig = {
  configured: false,
  name: '',
  serverIp: '',
  port: 0,
  useTls: false
}

export class ConfigStore {
  private readonly file: string

  constructor() {
    this.file = path.join(app.getPath('userData'), 'config.json')
  }

  async load(): Promise<AppConfig> {
    try {
      const raw = await fsp.readFile(this.file, 'utf8')
      const parsed = JSON.parse(raw) as Partial<AppConfig>
      return {
        configured: parsed.configured === true,
        name: typeof parsed.name === 'string' ? parsed.name : '',
        serverIp: typeof parsed.serverIp === 'string' ? parsed.serverIp : '',
        port: Number.isFinite(parsed.port) ? Number(parsed.port) : DEFAULT_PORT,
        useTls: parsed.useTls === true
      }
    } catch {
      return { ...DEFAULTS }
    }
  }

  async save(cfg: AppConfig): Promise<void> {
    await fsp.writeFile(this.file, JSON.stringify(cfg, null, 2))
  }
}