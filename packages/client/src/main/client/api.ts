import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { Readable } from 'node:stream'
import path from 'node:path'
import { fetch as undiciFetch, Agent, type RequestInit, type Response } from 'undici'
import type { OrgSnapshot, WorkStatus } from '@solidsync/shared'

export class ApiError extends Error {}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text()
  if (res.ok) {
    return (text ? JSON.parse(text) : {}) as T
  }
  let message = `server error (HTTP ${res.status})`
  try {
    const json = JSON.parse(text)
    if (json && typeof json.error === 'string') message = json.error
  } catch {
    /* keep generic */
  }
  throw new ApiError(message)
}

/** Thin REST client toward the SolidSync server (the single source of truth). */
export class SolidSyncApi {
  user: string

  baseUrl: string

  /** TLS agent; set to a CA-pinned undici Agent when talking over HTTPS. */
  dispatcher?: Agent

  constructor(baseUrl = '', user = 'someone') {
    this.baseUrl = baseUrl
    this.user = user
  }

  private url(p: string): string {
    return `${this.baseUrl}${p.startsWith('/') ? p : '/' + p}`
  }

  private req(p: string, init: RequestInit = {}): Promise<Response> {
    return undiciFetch(this.url(p), { ...init, dispatcher: this.dispatcher })
  }

  private jsonHeaders(): Record<string, string> {
    return { 'Content-Type': 'application/json', 'X-User': this.user }
  }

  async health(): Promise<{ ok: boolean; orgName: string; rev: number; serverTime: string; version: string }> {
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
    return (body as { projectId: string }).projectId
  }

  async createSection(projectId: string, name: string): Promise<string> {
    const body = await this.req(`/api/projects/${projectId}/sections`, {
      method: 'POST',
      headers: this.jsonHeaders(),
      body: JSON.stringify({ name })
    }).then((r) => parse<ServerBody>(r))
    return (body as { sectionId: string }).sectionId
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

  async setHead(partId: string, versionId: string): Promise<void> {
    await this.req(`/api/parts/${partId}/head`, {
      method: 'POST',
      headers: this.jsonHeaders(),
      body: JSON.stringify({ versionId })
    }).then((r) => parse<void>(r))
  }

  async setParent(partId: string, parentId: string | null): Promise<void> {
    await this.req(`/api/parts/${partId}/parent`, {
      method: 'POST',
      headers: this.jsonHeaders(),
      body: JSON.stringify({ parentId })
    }).then((r) => parse<void>(r))
  }

  async setPartName(partId: string, name: string): Promise<void> {
    await this.req(`/api/parts/${partId}/name`, {
      method: 'PATCH',
      headers: this.jsonHeaders(),
      body: JSON.stringify({ name })
    }).then((r) => parse<void>(r))
  }

  private async multipart(
    p: string,
    filePath: string,
    fields: Record<string, string>,
    onProgress?: (sent: number, total: number) => void
  ): Promise<ServerBody> {
    const st = await stat(filePath)
    const boundary = `----solidsync-${randomBytes(12).toString('hex')}`
    const enc = new TextEncoder()

    const list: Uint8Array[] = []
    for (const [k, v] of Object.entries(fields)) {
      list.push(enc.encode(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`))
    }
    const fileHeader = enc.encode(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${path.basename(filePath)}"\r\nContent-Type: application/octet-stream\r\n\r\n`
    )
    const end = enc.encode(`\r\n--${boundary}--\r\n`)
    const prefix = Buffer.concat(list)

    const total = prefix.length + fileHeader.length + st.size + end.length
    let sent = 0

    const rs = Readable.from(
      (async function* () {
        yield prefix
        yield fileHeader
        const src = createReadStream(filePath, { highWaterMark: 256 * 1024 })
        for await (const chunk of src) {
          sent += chunk.length
          onProgress?.(sent, total)
          yield chunk
        }
        yield end
      })()
    )

    return this.req(p, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'X-User': this.user
      },
      body: Readable.toWeb(rs),
      duplex: 'half'
    } as unknown as RequestInit).then((r) => parse<ServerBody>(r))
  }

  /** Throw a new file into a section. */
  async uploadNew(opts: {
    projectId: string
    sectionId: string
    filePath: string
    parentId?: string | null
  }, onProgress?: (sent: number, total: number) => void): Promise<{ partId: string; versionId: string }> {
    const body = await this.multipart('/api/upload', opts.filePath, {
      projectId: opts.projectId,
      sectionId: opts.sectionId,
      parentId: opts.parentId ?? ''
    }, onProgress)
    return { partId: body.partId ?? '', versionId: body.versionId ?? '' }
  }

  /** Save a new version of an existing part. */
  async saveVersion(opts: { projectId: string; partId: string; filePath: string }, onProgress?: (sent: number, total: number) => void): Promise<{ partId: string; versionId: string }> {
    const body = await this.multipart(
      `/api/projects/${opts.projectId}/parts/${opts.partId}/versions`,
      opts.filePath,
      {},
      onProgress
    )
    return { partId: body.partId ?? '', versionId: body.versionId ?? '' }
  }

  /** Raw bytes of one versioned file. */
  async downloadBytes(projectId: string, partId: string, versionId: string): Promise<Buffer> {
    const res = await this.req(
      `/api/projects/${projectId}/parts/${partId}/versions/${versionId}/file`,
      { signal: AbortSignal.timeout(120000) }
    )
    if (!res.ok) throw new ApiError(`download failed (HTTP ${res.status})`)
    return Buffer.from(await res.arrayBuffer())
  }
}

interface ServerBody {
  ok: boolean
  error?: string
  projectId?: string
  sectionId?: string
  partId?: string
  versionId?: string
  name?: string
}
