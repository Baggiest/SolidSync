import { readFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { fetch as undiciFetch, Agent, type RequestInit, type Response, type BodyInit } from 'undici'
import type { OrgSnapshot, WorkStatus } from '@solidsync/shared'

export class ApiError extends Error {}

interface ServerBody {
  ok: boolean
  error?: string
  projectId?: string
  sectionId?: string
  partId?: string
  versionId?: string
  name?: string
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text()
  if (res.ok) return (text ? JSON.parse(text) : {}) as T
  let message = `server error (HTTP ${res.status})`
  try {
    const json = JSON.parse(text) as { error?: string }
    if (json && typeof json.error === 'string') message = json.error
  } catch {
    /* keep generic */
  }
  throw new ApiError(message)
}

/**
 * Minimal admin REST client, shared by the CLI commands and the API test suite.
 * The GUI has its own (richer) client inside the Electron app.
 * Pass a CA PEM to talk to a self-signed HTTPS server.
 */
export class ServerClient {
  private readonly dispatcher?: Agent

  constructor(
    readonly baseUrl: string,
    public user = 'admin',
    caPem?: string
  ) {
    if (caPem) this.dispatcher = new Agent({ connect: { ca: [caPem] } })
  }

  private url(p: string): string {
    return `${this.baseUrl}${p.startsWith('/') ? p : '/' + p}`
  }

  private req(p: string, init: RequestInit = {}): Promise<Response> {
    return undiciFetch(this.url(p), { ...init, dispatcher: this.dispatcher } as RequestInit)
  }

  private jsonHeaders(): Record<string, string> {
    return { 'Content-Type': 'application/json', 'X-User': this.user }
  }

  async health(): Promise<{ ok: boolean; orgName: string; hostName?: string; rev: number; serverTime: string; version: string }> {
    const res = await this.req('/api/health', { signal: AbortSignal.timeout(8000) })
    return parse(res)
  }

  async getOrg(): Promise<OrgSnapshot> {
    const res = await this.req('/api/org', { signal: AbortSignal.timeout(15000) })
    return parse<OrgSnapshot>(res)
  }

  async createProject(name: string): Promise<string> {
    const body = await this.req('/api/projects', {
      method: 'POST',
      headers: this.jsonHeaders(),
      body: JSON.stringify({ name })
    }).then((r) => parse<ServerBody>(r))
    return body.projectId ?? ''
  }

  async createSection(projectId: string, name: string): Promise<string> {
    const body = await this.req(`/api/projects/${projectId}/sections`, {
      method: 'POST',
      headers: this.jsonHeaders(),
      body: JSON.stringify({ name })
    }).then((r) => parse<ServerBody>(r))
    return body.sectionId ?? ''
  }

  async setWorkStatus(partId: string, workStatus: WorkStatus): Promise<void> {
    await this.req(`/api/parts/${partId}/status`, {
      method: 'PUT',
      headers: this.jsonHeaders(),
      body: JSON.stringify({ workStatus })
    }).then((r) => parse<void>(r))
  }

  async archiveProject(projectId: string): Promise<void> {
    await this.req(`/api/projects/${projectId}/archive`, {
      method: 'POST',
      headers: this.jsonHeaders()
    }).then((r) => parse<void>(r))
  }

  async unarchiveProject(projectId: string): Promise<void> {
    await this.req(`/api/projects/${projectId}/unarchive`, {
      method: 'POST',
      headers: this.jsonHeaders()
    }).then((r) => parse<void>(r))
  }

  async branchProject(opts: { projectId: string; name?: string }): Promise<{ projectId: string; name: string }> {
    const body = await this.req(`/api/projects/${opts.projectId}/copy`, {
      method: 'POST',
      headers: this.jsonHeaders(),
      body: JSON.stringify({ name: opts.name ?? '' })
    }).then((r) => parse<ServerBody>(r))
    return { projectId: body.projectId ?? '', name: body.name ?? '' }
  }

  private async multipart(p: string, filePath: string, fields: Record<string, string>): Promise<ServerBody> {
    const buf = await readFile(filePath)
    const boundary = `----solidsync-${randomBytes(12).toString('hex')}`
    const chunks: Buffer[] = []
    for (const [k, v] of Object.entries(fields)) {
      chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`))
    }
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${path.basename(filePath)}"\r\nContent-Type: application/octet-stream\r\n\r\n`
      )
    )
    chunks.push(buf, Buffer.from(`\r\n--${boundary}--\r\n`))
    return this.req(p, {
      method: 'POST',
      headers: {
        'X-User': this.user,
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      },
      body: Buffer.concat(chunks) as unknown as BodyInit
    }).then((r) => parse<ServerBody>(r))
  }

  async uploadNew(opts: {
    projectId: string
    sectionId: string
    filePath: string
    parentId?: string | null
  }): Promise<{ partId: string; versionId: string }> {
    const body = await this.multipart('/api/upload', opts.filePath, {
      projectId: opts.projectId,
      sectionId: opts.sectionId,
      parentId: opts.parentId ?? ''
    })
    return { partId: body.partId ?? '', versionId: body.versionId ?? '' }
  }

  async downloadBytes(projectId: string, partId: string, versionId: string): Promise<Buffer> {
    const res = await this.req(
      `/api/projects/${projectId}/parts/${partId}/versions/${versionId}/file`,
      { signal: AbortSignal.timeout(120000) }
    )
    if (!res.ok) throw new ApiError(`download failed (HTTP ${res.status})`)
    return Buffer.from(await res.arrayBuffer())
  }

  async saveVersion(opts: { projectId: string; partId: string; filePath: string }): Promise<{ partId: string; versionId: string }> {
    const body = await this.multipart(
      `/api/projects/${opts.projectId}/parts/${opts.partId}/versions`,
      opts.filePath,
      {}
    )
    return { partId: body.partId ?? '', versionId: body.versionId ?? '' }
  }
}