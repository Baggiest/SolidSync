import { app } from 'electron'
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import type { AppConfig, HostPreset } from '@solidsync/shared'
import { DEFAULT_PORT } from '@solidsync/shared'

export interface PersistedConfig {
  config: AppConfig
  hosts: HostPreset[]
}

const DEFAULTS: AppConfig = {
  configured: false,
  name: '',
  serverIp: '',
  port: 0,
  useTls: false
}

function sanitizeConfig(c: Partial<AppConfig> | undefined): AppConfig {
  return {
    configured: c?.configured === true,
    name: typeof c?.name === 'string' ? c.name : '',
    serverIp: typeof c?.serverIp === 'string' ? c.serverIp : '',
    port: Number.isFinite(c?.port) ? Number(c!.port) : DEFAULT_PORT,
    useTls: c?.useTls === true
  }
}

function sanitizeHosts(h: unknown): HostPreset[] {
  if (!Array.isArray(h)) return []
  return h.filter((x): x is HostPreset => {
    if (!x || typeof x !== 'object') return false
    const o = x as Record<string, unknown>
    return (
      typeof o.id === 'string' &&
      typeof o.serverIp === 'string' &&
      Number.isFinite(o.port)
    )
  }).map((o) => ({
    id: o.id,
    name: typeof o.name === 'string' ? o.name : o.serverIp,
    serverIp: o.serverIp,
    port: o.port,
    useTls: o.useTls === true
  }))
}

export class ConfigStore {
  private readonly file: string

  constructor() {
    this.file = path.join(app.getPath('userData'), 'config.json')
  }

  async load(): Promise<PersistedConfig> {
    try {
      const raw = await fsp.readFile(this.file, 'utf8')
      const parsed = JSON.parse(raw) as Record<string, unknown>
      // Migrate the pre-hosts flat shape ({configured, name, ...}).
      if (typeof parsed.serverIp === 'string' || parsed.configured !== undefined) {
        return { config: sanitizeConfig(parsed as Partial<AppConfig>), hosts: [] }
      }
      return {
        config: sanitizeConfig(parsed.config as Partial<AppConfig> | undefined),
        hosts: sanitizeHosts(parsed.hosts)
      }
    } catch {
      return { config: { ...DEFAULTS }, hosts: [] }
    }
  }

  async save(data: PersistedConfig): Promise<void> {
    await fsp.writeFile(this.file, JSON.stringify(data, null, 2))
  }
}
