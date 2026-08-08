import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { OrgSnapshot, WorkStatus } from '@solidsync/shared'

export class ApiError extends Error {}

async function parse<T>(res: globalThis.Response): Promise<T> {
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

  constructor(baseUrl: string, user = 'someone') {
    this.baseUrl = baseUrl
    this.user = user
  }

  private url(p: string): string {
    return `${this.baseUrl}${p.startsWith('/') ? p : '/' + p}`
  }

  private jsonHeaders(): Record<string, string> {
    return { 'Content-Type': 'application/json', 'X-User': this.user }
  }

  async health(): Promise<{ ok: boolean; orgName: string; rev: number; serverTime: string; version: string }> {
    const res = await fetch(this.url('/api/health'), { signal: AbortSignal.timeout(8000) })
    return parse(res)
  }

  async getOrg(): Promise<OrgSnapshot> {
    const res = await fetch(this.url('/api/org'), { signal: AbortSignal.timeout(15000) })
    return parse<OrgSnapshot>(res)
  }

  async createProject(name: string): Promise<string> {
    const body = await fetch(this.url('/api/projects'), {
      method: 'POST',
      headers: this.jsonHeaders(),
      body: JSON.stringify({ name })
    }).then((r) => parse<ServerBody>(r))
    return (body as { projectId: string }).projectId
  }

  async createSection(projectId: string, name: string): Promise<string> {
    const body = await fetch(this.url(`/api/projects/${projectId}/sections`), {
      method: 'POST',
      headers: this.jsonHeaders(),
      body: JSON.stringify({ name })
    }).then((r) => parse<ServerBody>(r))
    return (body as { sectionId: string }).sectionId
  }

  /** Start an independent working copy of a project (spec §6). */
  async branchProject(opts: { projectId: string; name?: string }): Promise<{ projectId: string; name: string }> {
    const body = await fetch(this.url(`/api/projects/${opts.projectId}/copy`), {
      method: 'POST',
      headers: this.jsonHeaders(),
      body: JSON.stringify({ name: opts.name ?? '' })
    }).then((r) => parse<ServerBody>(r))
    return { projectId: body.projectId ?? '', name: body.name ?? '' }
  }

  async setWorkStatus(partId: string, workStatus: WorkStatus): Promise<void> {
    await fetch(this.url(`/api/parts/${partId}/status`), {
      method: 'PUT',
      headers: this.jsonHeaders(),
      body: JSON.stringify({ workStatus })
    }).then((r) => parse<void>(r))
  }

  async setHead(partId: string, versionId: string): Promise<void> {
    await fetch(this.url(`/api/parts/${partId}/head`), {
      method: 'POST',
      headers: this.jsonHeaders(),
      body: JSON.stringify({ versionId })
    }).then((r) => parse<void>(r))
  }

  async setParent(partId: string, parentId: string | null): Promise<void> {
    await fetch(this.url(`/api/parts/${partId}/parent`), {
      method: 'POST',
      headers: this.jsonHeaders(),
      body: JSON.stringify({ parentId })
    }).then((r) => parse<void>(r))
  }

  async setPartName(partId: string, name: string): Promise<void> {
    await fetch(this.url(`/api/parts/${partId}/name`), {
      method: 'PATCH',
      headers: this.jsonHeaders(),
      body: JSON.stringify({ name })
    }).then((r) => parse<void>(r))
  }

  private async multipart(p: string, filePath: string, fields: Record<string, string>): Promise<ServerBody> {
    const buf = await readFile(filePath)
    const form = new FormData()
    form.append('file', new Blob([new Uint8Array(buf)], { type: 'application/octet-stream' }), path.basename(filePath))
    for (const [k, v] of Object.entries(fields)) form.append(k, v)
    return fetch(this.url(p), { method: 'POST', headers: { 'X-User': this.user }, body: form }).then(
      (r) => parse<ServerBody>(r)
    )
  }

  /** Throw a new file into a section. */
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

  /** Save a new version of an existing part. */
  async saveVersion(opts: { projectId: string; partId: string; filePath: string }): Promise<{ partId: string; versionId: string }> {
    const body = await this.multipart(
      `/api/projects/${opts.projectId}/parts/${opts.partId}/versions`,
      opts.filePath,
      {}
    )
    return { partId: body.partId ?? '', versionId: body.versionId ?? '' }
  }

  /** Raw bytes of one versioned file. */
  async downloadBytes(projectId: string, partId: string, versionId: string): Promise<Buffer> {
    const res = await fetch(
      this.url(`/api/projects/${projectId}/parts/${partId}/versions/${versionId}/file`),
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