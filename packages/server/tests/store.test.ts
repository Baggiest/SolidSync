import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { OrgStore } from '../src/store'
import { Repo } from '../src/git'
import { loadSqlJs } from '../src/wasm'
import { hashBytes, id6, sha1File } from '../src/lib/hash'

let tmp: string
let store: OrgStore

beforeAll(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'solidsync-test-'))
  store = await OrgStore.open(tmp, 'Test Shop')
})

afterAll(async () => {
  await store.close()
  await rm(tmp, { recursive: true, force: true })
})

/** New project + its default section, idempotent-ish per call. */
async function newProject(name?: string): Promise<{ projectId: string; sectionId: string }> {
  const projectId = await store.createProject(name ?? `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`)
  const proj = store.getOrgSnapshot().projects.find((p) => p.id === projectId)!
  return { projectId, sectionId: proj.sections[0]!.id }
}

/** Ingest a raw part inside one store.enqueue (mimics the HTTP layer). */
function ingest(opts: {
  projectId: string
  sectionId: string
  fileName: string
  content: string
  by: string
}) {
  const sha1 = hashBytes(Buffer.from(opts.content))
  return store.enqueue(() =>
    Promise.resolve(
      store.rawIngestNewPart({
        projectId: opts.projectId,
        sectionId: opts.sectionId,
        fileName: opts.fileName,
        ext: 'sldprt',
        sha1,
        size: opts.content.length,
        by: opts.by,
        parentId: null
      })
    )
  )
}

describe('OrgStore', () => {
  it('creates a project with a default General section', async () => {
    const projectId = await store.createProject('Gearbox')
    const project = store.getOrgSnapshot().projects.find((p) => p.id === projectId)
    expect(project).toBeDefined()
    expect(project!.sections.map((s) => s.name)).toContain('General')
  })

  it('bumps rev on every convenience mutation', async () => {
    const { projectId } = await newProject()
    const before = store.getRev()
    await store.createSection(projectId, 'Drivetrain')
    expect(store.getRev()).toBe(before + 1)
  })

  it('turns the last 6 hex chars of the sha into a stable part id', async () => {
    const { projectId, sectionId } = await newProject('Frames')
    const version = await store.enqueue(async () =>
      store.rawIngestNewPart({
        projectId,
        sectionId,
        fileName: 'holder.sldprt',
        ext: 'sldprt',
        sha1: hashBytes(Buffer.from('fuel-cell-holder')),
        size: 10,
        by: 'ana',
        parentId: null
      })
    )
    const part = store.getPart(version.partId)
    expect(part).toBeTruthy()
    expect(part!.id).toBe(id6(hashBytes(Buffer.from('fuel-cell-holder'))))
    expect(part!.id).toHaveLength(6)
    expect(part!.workStatus).toBe('green')
  })

  it('re- throwing the exact same object hits the same part', async () => {
    const { projectId, sectionId } = await newProject('Dupe')
    const content = 'same-object'
    const v1 = await store.enqueue(() =>
      store.rawIngestNewPart({
        projectId, sectionId, fileName: 'x.sldprt', ext: 'sldprt',
        sha1: hashBytes(Buffer.from(content)), size: content.length, by: 'a', parentId: null
      })
    )
    const found = await store.enqueue(async () => store.rawFindPartBySha1(hashBytes(Buffer.from(content))))
    expect(found?.partId).toBe(v1.partId)
  })

  it('tracks work status and head moves separately', async () => {
    const { projectId, sectionId } = await newProject('Status')
    const v1 = await ingest({ projectId, sectionId, fileName: 'y.sldprt', content: 'one', by: 'b' })
    await store.setWorkStatus(v1.partId, 'red')
    expect(store.getPart(v1.partId)?.workStatus).toBe('red')
    const beforeHead = store.getPart(v1.partId)!.head
    const v2 = await store.enqueue(() =>
      store.rawAddVersion({ partId: v1.partId, fileName: 'y.sldprt', ext: 'sldprt', sha1: hashBytes(Buffer.from('two')), size: 3, by: 't' })
    )
    await store.setHead(v1.partId, v2.id)
    const part = store.getPart(v1.partId)!
    expect(part.head).toBe(v2.id)
    expect(part.head).not.toBe(beforeHead)
    expect(part.versions).toHaveLength(2)
  })

  it('a part cannot be its own parent', async () => {
    const { projectId, sectionId } = await newProject('OwnParent')
    const v = await ingest({ projectId, sectionId, fileName: 'z.sldprt', content: 'zz', by: 'z' })
    await expect(store.enqueue(async () => store.rawSetParent(v.partId, v.partId))).rejects.toThrow()
  })

  it('archives and unarchives a project', async () => {
    const { projectId } = await newProject('ArchiveMe')
    expect(store.getOrgSnapshot().projects.find((p) => p.id === projectId)!.archived).toBe(false)
    await store.archiveProject(projectId)
    expect(store.getOrgSnapshot().projects.find((p) => p.id === projectId)!.archived).toBe(true)
    await store.unarchiveProject(projectId)
    expect(store.getOrgSnapshot().projects.find((p) => p.id === projectId)!.archived).toBe(false)
  })

  it('archiving bumps the org rev', async () => {
    const { projectId } = await newProject('ArchiveRev')
    const before = store.getRev()
    await store.archiveProject(projectId)
    expect(store.getRev()).toBe(before + 1)
  })

  it('branched copies of an archived project are active', async () => {
    const { projectId, sectionId } = await newProject('ArchiveBranch')
    await ingest({ projectId, sectionId, fileName: 'axle.sldprt', content: 'axle-v1', by: 'ana' })
    await store.archiveProject(projectId)
    const copy = await store.branchProject(projectId, 'Copy of archived')
    const copyRow = store.getOrgSnapshot().projects.find((p) => p.id === copy.projectId)!
    expect(copyRow.archived).toBe(false)
  })

  it('migrates a pre-archive database by adding the archived column', async () => {
    const dir = path.join(tmp, 'migrate-v2')
    await mkdir(dir, { recursive: true })
    const sql = await loadSqlJs()
    const old = new sql.Database()
    old.run(
      `CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL);`
    )
    old.run(`INSERT INTO projects(id,name,created_at) VALUES('p000000','Old Shop','2026-01-01T00:00:00.000Z')`)
    await writeFile(path.join(dir, 'solidsync.db'), Buffer.from(old.export()))
    old.close()

    const migrated = await OrgStore.open(dir, 'Migrated')
    const row = migrated.getOrgSnapshot().projects.find((p) => p.id === 'p000000')!
    expect(row.archived).toBe(false)
    await migrated.archiveProject('p000000')
    expect(migrated.getOrgSnapshot().projects.find((p) => p.id === 'p000000')!.archived).toBe(true)
    await migrated.close()
  })

  it('starts an independent copy of a project', async () => {
    const { projectId, sectionId } = await newProject('FrameAssembly')
    const a = await ingest({ projectId, sectionId, fileName: 'frame.sldprt', content: 'frame-v1', by: 'ana' })
    await store.enqueue(async () => store.rawAddVersion({ partId: a.partId, fileName: 'frame.sldprt', ext: 'sldprt', sha1: hashBytes(Buffer.from('frame-v2')), size: 8, by: 'ana' }))
    const b = await ingest({ projectId, sectionId, fileName: 'bolt.sldprt', content: 'bolt', by: 'ana' })
    await store.setWorkStatus(a.partId, 'red')
    await store.setHead(a.partId, (await store.getPart(a.partId))!.versions[1]!.id)
    await store.enqueue(async () => store.rawSetParent(b.partId, a.partId))

    const branch = await store.branchProject(projectId, 'FrameAssembly (my copy)')
    expect(branch.versionsCopied).toBe(3) // frame v1+v2, bolt v1

    const src = store.getOrgSnapshot().projects.find((p) => p.id === projectId)!
    const copy = store.getOrgSnapshot().projects.find((p) => p.id === branch.projectId)!
    expect(copy.name).toBe('FrameAssembly (my copy)')
    expect(copy.sections.map((s) => s.name)).toEqual(src.sections.map((s) => s.name))

    const copyA = copy.sections[0]!.parts.find((p) => p.name === 'frame.sldprt')!
    const copyB = copy.sections[0]!.parts.find((p) => p.name === 'bolt.sldprt')!
    const srcA = src.sections[0]!.parts.find((p) => p.name === 'frame.sldprt')!
    const srcB = src.sections[0]!.parts.find((p) => p.name === 'bolt.sldprt')!

    expect(copyA.id).not.toBe(srcA.id)
    expect(copyB.id).not.toBe(srcB.id)
    expect(copyA.workStatus).toBe('red')
    expect(copyA.versions).toHaveLength(2)
    expect(copyA.head).toBe(copyA.versions[1]!.id)
    expect(copyB.parentId).toBe(copyA.id)
    expect(copyB.parentId).not.toBe(srcA.id)

    // source project is untouched
    expect(srcA.versions).toHaveLength(2)
    expect(srcB.parentId).toBe(srcA.id)

    // every copied version has an actual file in the copy's git working tree
    const rel = store.versionRelPath(copy.sections[0]!.id, copyA.id, copyA.versions[1]!.id, copyA.ext)
    await expect(access(path.join(store.projectRepoDir(branch.projectId), rel))).resolves.toBeUndefined()
  })

  it('keeps the host name stable across restarts', async () => {
    const dir = path.join(tmp, 'hostname')
    await mkdir(dir, { recursive: true })
    const first = await OrgStore.open(dir, 'Host Shop', 'Princeton-library')
    expect(first.getHostName()).toBe('Princeton-library')
    await first.close()

    const reopened = await OrgStore.open(dir, 'Host Shop')
    expect(reopened.getHostName()).toBe('Princeton-library')
    await reopened.close()
  })

  it('lets a given host name override the stored one', async () => {
    const dir = path.join(tmp, 'hostname-override')
    await mkdir(dir, { recursive: true })
    const first = await OrgStore.open(dir, 'Host Shop', 'Old-name')
    await first.close()

    const renamed = await OrgStore.open(dir, 'Host Shop', 'New-name')
    expect(renamed.getHostName()).toBe('New-name')
    await renamed.close()
  })

  it('falls back to a random fruit/animal host name when none is given', async () => {
    const dir = path.join(tmp, 'hostname-random')
    await mkdir(dir, { recursive: true })
    const fresh = await OrgStore.open(dir, 'Host Shop')
    expect(fresh.getHostName()).toBeTruthy()
    expect(typeof fresh.getHostName()).toBe('string')
    await fresh.close()
  })
})

describe('Repo (git engine)', () => {
  let repoDir: string
  beforeAll(async () => {
    repoDir = path.join(tmp, 'gitrepo')
    await new Repo(repoDir).ensureInit()
  })

  it('commits files and reads them back from history', async () => {
    const repo = new Repo(repoDir)
    await mkdir(path.join(repoDir, 'dir'), { recursive: true })
    await writeFile(path.join(repoDir, 'dir', 'hello.txt'), 'hello world')
    const commit = await repo.commitPaths(['dir/hello.txt'], 'add hello')
    expect(commit).toMatch(/^[0-9a-f]{7,40}$/)
    const buf = await repo.readFromHistory(commit, 'dir/hello.txt')
    expect(buf?.toString()).toBe('hello world')
  })
})

describe('hash', () => {
  it('sha1File produces 40 hex chars and the id6 the last six', async () => {
    const f = path.join(tmp, 'sample.bin')
    await writeFile(f, 'abcdef')
    const hex = await sha1File(f)
    expect(hex).toHaveLength(40)
    expect(hex.slice(-6)).toBe(id6(hex))
  })
})