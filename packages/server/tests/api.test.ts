import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { OrgStore } from '../src/store'
import { createApp } from '../src/app'
import { startHttp } from '../src/http'
import { ServerClient } from '../src/http-client'

let tmp: string
let store: OrgStore
let server: { close: () => Promise<void>; port: number }
let api: ServerClient

beforeAll(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'solidgit-api-'))
  store = await OrgStore.open(tmp, 'API Shop')
  server = await startHttp(createApp(store), 0, '127.0.0.1')
  api = new ServerClient(`http://127.0.0.1:${server.port}`, 'tester')
})

afterAll(async () => {
  await server.close()
  await store.close()
  await rm(tmp, { recursive: true, force: true })
})

describe('REST API', () => {
  it('health reports the org and a rev', async () => {
    const h = await api.health()
    expect(h.orgName).toBe('API Shop')
    expect(typeof h.rev).toBe('number')
  })

  it('creates a project and section over HTTP', async () => {
    const projectId = await api.createProject('Hexible')
    expect(projectId).toMatch(/^p[0-9a-f]{6}$/)
    const sectionId = await api.createSection(projectId, 'Wiring')
    expect(sectionId).toMatch(/^s[0-9a-f]{6}$/)
  })

  it('throws a file in and gets a deterministic 6-digit part id', async () => {
    const projectId = await api.createProject('Ingest')
    const org = await api.getOrg()
    const sectionId = org.projects.find((p) => p.id === projectId)!.sections[0]!.id

    const partPath = path.join(tmp, 'motor.sldprt')
    await writeFile(partPath, 'motor-body')
    const res = await api.uploadNew({ projectId, sectionId, filePath: partPath })

    const fresh = await api.getOrg()
    const project = fresh.projects.find((p) => p.id === projectId)!
    const parts = project.sections.flatMap((s) => s.parts)
    expect(parts).toHaveLength(1)
    const part = parts[0]
    expect(part.id).toHaveLength(6)
    expect(part.versions).toHaveLength(1)
    expect(part.head).toBe(part.versions[0].id)
    void res
  })

  it('saves a second version and moves head', async () => {
    const projectId = await api.createProject('Evolution')
    const org = await api.getOrg()
    const sectionId = org.projects.find((p) => p.id === projectId)!.sections[0]!.id

    const partPath = path.join(tmp, 'brace.sldprt')
    await writeFile(partPath, 'v1')
    await api.uploadNew({ projectId, sectionId, filePath: partPath })

    await writeFile(partPath, 'v2-much-later')
    await api.saveVersion({ projectId, partId: (await api.getOrg()).projects.find((p) => p.id === projectId)!.sections[0]!.parts[0]!.id, filePath: partPath })

    const proj = (await api.getOrg()).projects.find((p) => p.id === projectId)!
    const part = proj.sections[0]!.parts[0]!
    expect(part.versions).toHaveLength(2)
    expect(part.head).toBe(part.versions[1].id)
  })

  it('downloads the exact bytes of any version', async () => {
    const projectId = await api.createProject('DL')
    const org = await api.getOrg()
    const sectionId = org.projects.find((p) => p.id === projectId)!.sections[0]!.id

    const payload = Buffer.from('binary-cad-digits\x00\x01\x02')
    const partPath = path.join(tmp, 'dl.sldprt')
    await writeFile(partPath, payload)
    await api.uploadNew({ projectId, sectionId, filePath: partPath })

    const part = (await api.getOrg()).projects.find((p) => p.id === projectId)!.sections[0]!.parts[0]!
    const head = part.head!
    const bytes = await api.downloadBytes(projectId, part.id, head)
    expect(Buffer.from(bytes).equals(payload)).toBe(true)
  })

  it('bumps the global rev each mutation', async () => {
    const projectId = await api.createProject('RevProbe')
    const sectionId = (await api.getOrg()).projects.find((p) => p.id === projectId)!.sections[0]!.id
    const partPath = path.join(tmp, 'rev.sldprt')
    await writeFile(partPath, 'rev-probe-bytes')
    await api.uploadNew({ projectId, sectionId, filePath: partPath })
    const partId = (await api.getOrg()).projects.find((p) => p.id === projectId)!.sections[0]!.parts[0]!.id

    const h = await api.health()
    await api.setWorkStatus(partId, 'yellow')
    const h2 = await api.health()
    expect(h2.rev).toBeGreaterThan(h.rev)
  })

  it('hash-identical re-throws create a new version on the same part', async () => {
    const projectId = await api.createProject('Dedupe')
    const org = await api.getOrg()
    const sectionId = org.projects.find((p) => p.id === projectId)!.sections[0]!.id

    const partPath = path.join(tmp, 'dup.sldprt')
    await writeFile(partPath, 'same-bytes')
    await api.uploadNew({ projectId, sectionId, filePath: partPath })
    await api.uploadNew({ projectId, sectionId, filePath: partPath })

    const proj = (await api.getOrg()).projects.find((p) => p.id === projectId)!
    const parts = proj.sections.flatMap((s) => s.parts)
    expect(parts).toHaveLength(1)
    expect(parts[0]!.versions).toHaveLength(2)
  })
})