import { randomBytes } from 'node:crypto'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { type Database } from 'sql.js'
import { Repo } from './git'
import { loadSqlJs } from './wasm'
import type { OrgSnapshot, PartInfo, WorkStatus, VersionInfo } from '@solidgit/shared'
import { SerialQueue } from './lib/queue'

const SCHEMA = `
PRAGMA user_version=2;
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sections (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS parts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  section_id TEXT NOT NULL,
  name TEXT NOT NULL,
  ext TEXT NOT NULL DEFAULT '',
  parent_id TEXT,
  work_status TEXT NOT NULL DEFAULT 'green',
  head TEXT,
  created_at TEXT NOT NULL,
  last_modified TEXT NOT NULL,
  last_modified_by TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS versions (
  id TEXT PRIMARY KEY,
  part_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  ext TEXT NOT NULL DEFAULT '',
  sha1 TEXT NOT NULL,
  hash6 TEXT NOT NULL,
  size INTEGER NOT NULL,
  submitted_at TEXT NOT NULL,
  submitted_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_parts_section ON parts(section_id);
CREATE INDEX IF NOT EXISTS idx_versions_part ON versions(part_id);
`

function shortId(prefix = ''): string {
  return prefix + randomBytes(3).toString('hex')
}

function mapVersion(r: Record<string, unknown>): VersionInfo {
  return {
    id: String(r.id),
    partId: String(r.part_id),
    fileName: String(r.file_name),
    hash6: String(r.hash6),
    size: Number(r.size),
    submittedAt: String(r.submitted_at),
    submittedBy: String(r.submitted_by)
  }
}

function rowToPart(r: Record<string, unknown>): PartInfo {
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    sectionId: String(r.section_id),
    name: String(r.name),
    ext: String(r.ext),
    parentId: r.parent_id === null ? null : String(r.parent_id),
    workStatus: String(r.work_status) as WorkStatus,
    head: r.head === null ? null : String(r.head),
    versions: [],
    lastModified: String(r.last_modified),
    lastModifiedBy: String(r.last_modified_by)
  }
}

/**
 * Metadata source of truth for the org: projects, sections, parts, versions,
 * work statuses, parent links. Stored in ONE SQLite file (sql.js / wasm) at
 * <root>/solidgit.db — zero setup, trivially backed up, runs on a potato.
 *
 * Version FILE bytes live in per-project git repos (see Repo) managed with the
 * real git binary. Every committed mutation bumps the org `rev`; clients poll
 * that number.
 *
 * Concurrency: `enqueue()` runs a body inside a single-threaded serial queue.
 * All file writes + git commits + DB row writes for one operation happen inside
 * one enqueue so they can't interleave with another request's.
 */
export class OrgStore {
  private db: Database
  private queue = new SerialQueue()
  readonly rootDir: string
  readonly orgName: string

  private constructor(db: Database, orgName: string, rootDir: string) {
    this.db = db
    this.orgName = orgName
    this.rootDir = rootDir
  }

  static async open(rootDir: string, orgName = 'Shop'): Promise<OrgStore> {
    const sql = await loadSqlJs()
    await mkdir(rootDir, { recursive: true })
    const dbPath = path.join(rootDir, 'solidgit.db')
    let db: Database
    try {
      const bytes = await readFile(dbPath)
      db = new sql.Database(new Uint8Array(bytes))
    } catch {
      db = new sql.Database()
    }
    db.run(SCHEMA)
    const store = new OrgStore(db, orgName, rootDir)
    store.setMeta('org_name', orgName)
    await store.save()
    return store
  }

  // ---- paths ------------------------------------------------------------------

  projectRepoDir(projectId: string): string {
    return path.join(this.rootDir, 'repos', projectId)
  }

  projectRepo(projectId: string): Repo {
    return new Repo(this.projectRepoDir(projectId))
  }

  /** Repo-relative path (posix style) holding a version's file. */
  versionRelPath(sectionId: string, partId: string, versionId: string, ext: string): string {
    return `parts/${sectionId}/${partId}/versions/${versionId}${ext ? '.' + ext : ''}`
  }

  // ---- db plumbing ----------------------------------------------------------

  private run(sql: string, params: unknown[] = []): void {
    this.db.run(sql, params as never[])
  }

  private get(sql: string, params: unknown[] = []): Record<string, unknown> | undefined {
    const res = this.db.exec(sql, params as never[])
    if (res.length === 0 || res[0].values.length === 0) return undefined
    const cols = res[0].columns
    const row = res[0].values[0]
    const out: Record<string, unknown> = {}
    cols.forEach((c, i) => { out[c] = row[i] as unknown })
    return out
  }

  private all(sql: string, params: unknown[] = []): Record<string, unknown>[] {
    const res = this.db.exec(sql, params as never[])
    if (res.length === 0) return []
    const cols = res[0].columns
    return res[0].values.map((row) => {
      const out: Record<string, unknown> = {}
      cols.forEach((c, i) => { out[c] = row[i] as unknown })
      return out
    })
  }

  private setMeta(key: string, value: string): void {
    this.run('INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)', [key, value])
  }

  private getMeta(key: string): string | null {
    const row = this.get('SELECT value FROM meta WHERE key=?', [key])
    return row ? String(row.value) : null
  }

  private bumpRev(): number {
    const next = this.getRev() + 1
    this.setMeta('rev', String(next))
    return next
  }

  /** Run a body inside the serial queue; on success bump rev and persist. */
  enqueue<T>(fn: () => Promise<T> | T): Promise<T> {
    return this.queue.enqueue(async () => {
      const result = await fn()
      this.bumpRev()
      await this.save()
      return result as T
    })
  }

  // ---- reads (safe anytime) --------------------------------------------------

  getRev(): number {
    return Number(this.getMeta('rev') ?? '0')
  }

  getOrgName(): string {
    return this.orgName
  }

  getPart(partId: string): PartInfo | null {
    const row = this.get('SELECT * FROM parts WHERE id=?', [partId])
    if (!row) return null
    const part: PartInfo = rowToPart(row)
    part.versions = this.getVersions(partId)
    return part
  }

  getVersionInfo(partId: string, versionId: string): VersionInfo | null {
    const row = this.get('SELECT * FROM versions WHERE part_id=? AND id=?', [partId, versionId])
    return row ? mapVersion(row) : null
  }

  private getVersions(partId: string): VersionInfo[] {
    return this.all('SELECT * FROM versions WHERE part_id=?', [partId])
      .map(mapVersion)
      .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
  }

  getOrgSnapshot(): OrgSnapshot {
    const projects = this.all('SELECT * FROM projects ORDER BY created_at, id').map((p) => {
      const sections = this.all(
        'SELECT * FROM sections WHERE project_id=? ORDER BY created_at, id',
        [String(p.id)]
      ).map((s) => {
        const parts = this.all(
          'SELECT * FROM parts WHERE section_id=? ORDER BY last_modified DESC',
          [String(s.id)]
        ).map((r) => {
          const part = rowToPart(r)
          part.versions = this.getVersions(part.id)
          return part
        })
        return { id: String(s.id), name: String(s.name), parts }
      })
      return { id: String(p.id), name: String(p.name), sections }
    })
    return { orgName: this.orgName, rev: this.getRev(), projects }
  }

  // ---- raw mutations (must be called inside enqueue) ---------------------------

  rawCreateProject(name: string): string {
    const id = shortId('p')
    const now = new Date().toISOString()
    this.run('INSERT INTO projects(id,name,created_at) VALUES(?,?,?)', [id, name, now])
    this.run('INSERT INTO sections(id,project_id,name,created_at) VALUES(?,?,?,?)', [
      shortId('s'),
      id,
      'General',
      now
    ])
    return id
  }

  rawCreateSection(projectId: string, name: string): string {
    const id = shortId('s')
    this.run('INSERT INTO sections(id,project_id,name,created_at) VALUES(?,?,?,?)', [
      id,
      projectId,
      name,
      new Date().toISOString()
    ])
    return id
  }

  rawSectionByName(projectId: string, name: string): string | null {
    const row = this.get('SELECT id FROM sections WHERE project_id=? AND name=?', [projectId, name])
    return row ? String(row.id) : null
  }

  rawDeleteProject(projectId: string): void {
    this.run('DELETE FROM versions WHERE part_id IN (SELECT id FROM parts WHERE project_id=?)', [
      projectId
    ])
    this.run('DELETE FROM parts WHERE project_id=?', [projectId])
    this.run('DELETE FROM sections WHERE project_id=?', [projectId])
    this.run('DELETE FROM projects WHERE id=?', [projectId])
  }

  rawFindPartBySha1(sha1: string): { partId: string; projectId: string } | null {
    const row = this.get(
      `SELECT v.part_id, p.project_id FROM versions v
        JOIN parts p ON p.id = v.part_id
        WHERE v.sha1=? LIMIT 1`,
      [sha1]
    )
    return row ? { partId: String(row.part_id), projectId: String(row.project_id) } : null
  }

  rawIngestNewPart(input: {
    projectId: string
    sectionId: string
    fileName: string
    ext: string
    sha1: string
    size: number
    by: string
    parentId: string | null
  }): VersionInfo {
    const id6 = input.sha1.slice(-6)
    let partId = id6
    let n = 0
    while (this.get('SELECT id FROM parts WHERE id=?', [partId])) {
      partId = `${id6}x${++n}`
    }
    const version = this.insertVersion({
      partId: partId,
      fileName: input.fileName,
      ext: input.ext,
      sha1: input.sha1,
      size: input.size,
      by: input.by,
      submittedAt: new Date().toISOString()
    })
    const now = version.submittedAt
    this.run(
      `INSERT INTO parts(id,project_id,section_id,name,ext,parent_id,work_status,head,created_at,last_modified,last_modified_by)
       VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      [partId, input.projectId, input.sectionId, input.fileName, input.ext, input.parentId, 'green', version.id, now, now, input.by]
    )
    return version
  }

  rawAddVersion(input: {
    partId: string
    fileName: string
    ext: string
    sha1: string
    size: number
    by: string
  }): VersionInfo {
    const version = this.insertVersion({ ...input, submittedAt: new Date().toISOString() })
    const now = version.submittedAt
    this.run('UPDATE parts SET last_modified=?, last_modified_by=? WHERE id=?', [now, input.by, input.partId])
    return version
  }

  private insertVersion(v: {
    partId: string
    fileName: string
    ext: string
    sha1: string
    size: number
    by: string
    submittedAt: string
  }): VersionInfo {
    const id = `${Date.now()}-${v.sha1.slice(-6)}`
    this.run(
      `INSERT INTO versions(id,part_id,file_name,ext,sha1,hash6,size,submitted_at,submitted_by)
       VALUES(?,?,?,?,?,?,?,?,?)`,
      [id, v.partId, v.fileName, v.ext, v.sha1, v.sha1.slice(-6), v.size, v.submittedAt, v.by]
    )
    return {
      id,
      partId: v.partId,
      fileName: v.fileName,
      hash6: v.sha1.slice(-6),
      size: v.size,
      submittedAt: v.submittedAt,
      submittedBy: v.by
    }
  }

  rawSetHead(partId: string, versionId: string): boolean {
    const part = this.get('SELECT head FROM parts WHERE id=?', [partId])
    if (!part) throw new Error('part not found')
    if (!this.get('SELECT id FROM versions WHERE id=? AND part_id=?', [versionId, partId]))
      throw new Error('version not found')
    this.run('UPDATE parts SET head=? WHERE id=?', [versionId, partId])
    return true
  }

  rawSetWorkStatus(partId: string, status: WorkStatus): void {
    if (!this.get('SELECT id FROM parts WHERE id=?', [partId])) throw new Error('part not found')
    this.run('UPDATE parts SET work_status=? WHERE id=?', [status, partId])
  }

  rawSetParent(partId: string, parentId: string | null): void {
    if (parentId === partId) throw new Error('a part cannot be its own parent')
    if (parentId && !this.get('SELECT id FROM parts WHERE id=?', [parentId]))
      throw new Error('parent part not found')
    this.run('UPDATE parts SET parent_id=? WHERE id=?', [parentId, partId])
  }

  rawSetPartName(partId: string, name: string): void {
    this.run('UPDATE parts SET name=? WHERE id=?', [name, partId])
  }

  // ---- public convenience mutators --------------------------------------------

  createProject(name: string): Promise<string> {
    return this.enqueue(async () => {
      const id = this.rawCreateProject(name)
      await this.projectRepo(id).ensureInit()
      return id
    })
  }

  createSection(projectId: string, name: string): Promise<string> {
    return this.enqueue(async () => {
      if (!this.get('SELECT id FROM projects WHERE id=?', [projectId]))
        throw new Error('project not found')
      return this.rawCreateSection(projectId, name)
    })
  }

  setHead(partId: string, versionId: string): Promise<boolean> {
    return this.enqueue(() => {
      this.rawSetHead(partId, versionId)
      return Promise.resolve(true)
    })
  }

  setWorkStatus(partId: string, status: WorkStatus): Promise<void> {
    return this.enqueue(() => {
      this.rawSetWorkStatus(partId, status)
      return Promise.resolve()
    })
  }

  setParent(partId: string, parentId: string | null): Promise<void> {
    return this.enqueue(() => {
      this.rawSetParent(partId, parentId)
      return Promise.resolve()
    })
  }

  setPartName(partId: string, name: string): Promise<void> {
    return this.enqueue(() => {
      this.rawSetPartName(partId, name)
      return Promise.resolve()
    })
  }

  deleteProject(projectId: string): Promise<void> {
    return this.enqueue(() => {
      this.rawDeleteProject(projectId)
      return Promise.resolve()
    })
  }

  // ---- branching ("start my own copy", spec §6) --------------------------------

  /**
   * An individual branches a Project by making an independent snapshot copy of
   * it: same sections, parts (new ids), versions (new ids), work statuses,
   * parent links and head pointers. The version FILE bytes are copied into the
   * new project's git repo. There is deliberately no merging anywhere.
   */
  branchProject(sourceId: string, name: string): Promise<{ projectId: string; name: string; versionsCopied: number }> {
    return this.enqueue(async () => {
      if (!this.get('SELECT id FROM projects WHERE id=?', [sourceId]))
        throw new Error('project not found')
      const raw = this.rawBranchProject(sourceId, name)
      const srcRepo = this.projectRepo(sourceId)
      const dstRepo = this.projectRepo(raw.newProjectId)
      await dstRepo.ensureInit()
      const fromDir = this.projectRepoDir(sourceId)
      const toDir = this.projectRepoDir(raw.newProjectId)
      for (const op of raw.ops) {
        const fromAbs = path.join(fromDir, op.fromRel)
        const toAbs = path.join(toDir, op.toRel)
        await mkdir(path.dirname(toAbs), { recursive: true })
        try {
          await copyFile(fromAbs, toAbs)
        } catch {
          // Bytes can be missing from the working tree (DB-only ingest); fall
          // back to the last commit's tree, else an empty placeholder.
          const bytes = await srcRepo.readFromHistory('HEAD', op.fromRel)
          await writeFile(toAbs, bytes ?? Buffer.alloc(0))
        }
      }
      await dstRepo.commitAll(`Start a copy of this project`)
      return { projectId: raw.newProjectId, name, versionsCopied: raw.copied }
    })
  }

  private rawBranchProject(sourceId: string, name: string): {
    newProjectId: string
    ops: { fromRel: string; toRel: string }[]
    copied: number
  } {
    const newProjectId = shortId('p')
    const now = new Date().toISOString()
    this.run('INSERT INTO projects(id,name,created_at) VALUES(?,?,?)', [newProjectId, name, now])

    const ops: { fromRel: string; toRel: string }[] = []
    let copied = 0
    const partIdMap = new Map<string, string>()
    const versionIdMap = new Map<string, string>()

    for (const srow of this.all('SELECT * FROM sections WHERE project_id=?', [sourceId])) {
      const sectionId = String(srow.id)
      const newSectionId = shortId('s')
      this.run('INSERT INTO sections(id,project_id,name,created_at) VALUES(?,?,?,?)', [
        newSectionId,
        newProjectId,
        String(srow.name),
        now
      ])
      for (const part of this.all('SELECT * FROM parts WHERE section_id=?', [sectionId])) {
        const oldPartId = String(part.id)
        const base = oldPartId.split('x')[0]
        let newPartId = base
        let n = 0
        while (this.get('SELECT id FROM parts WHERE id=?', [newPartId])) newPartId = `${base}x${++n}`
        partIdMap.set(oldPartId, newPartId)
        this.run(
          `INSERT INTO parts(id,project_id,section_id,name,ext,parent_id,work_status,head,created_at,last_modified,last_modified_by)
           VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
          [
            newPartId,
            newProjectId,
            newSectionId,
            String(part.name),
            String(part.ext),
            part.parent_id === null ? null : String(part.parent_id),
            String(part.work_status),
            null,
            now,
            String(part.last_modified),
            String(part.last_modified_by)
          ]
        )
        for (const vrow of this.all('SELECT * FROM versions WHERE part_id=? ORDER BY submitted_at', [oldPartId])) {
          const oldVId = String(vrow.id)
          const baseV = `${Date.now()}-${String(vrow.sha1).slice(-6)}`
          let newVId = baseV
          let v = 1
          while (this.get('SELECT id FROM versions WHERE id=?', [newVId])) newVId = `${baseV}-${v++}`
          versionIdMap.set(oldVId, newVId)
          this.run(
            `INSERT INTO versions(id,part_id,file_name,ext,sha1,hash6,size,submitted_at,submitted_by)
             VALUES(?,?,?,?,?,?,?,?,?)`,
            [
              newVId,
              newPartId,
              String(vrow.file_name),
              String(vrow.ext),
              String(vrow.sha1),
              String(vrow.hash6),
              Number(vrow.size),
              String(vrow.submitted_at),
              String(vrow.submitted_by)
            ]
          )
          ops.push({
            fromRel: this.versionRelPath(sectionId, oldPartId, oldVId, String(vrow.ext)),
            toRel: this.versionRelPath(newSectionId, newPartId, newVId, String(vrow.ext))
          })
          copied++
        }
        const head = part.head ? versionIdMap.get(String(part.head)) : null
        if (head) this.run('UPDATE parts SET head=? WHERE id=?', [head, newPartId])
      }
    }

    // Re-link parents that pointed at parts inside the copied project.
    for (const srow of this.all('SELECT * FROM sections WHERE project_id=?', [newProjectId])) {
      for (const child of this.all('SELECT * FROM parts WHERE section_id=?', [String(srow.id)])) {
        const parent = child.parent_id ? String(child.parent_id) : null
        if (!parent) continue
        const mapped = partIdMap.get(parent)
        if (mapped) this.run('UPDATE parts SET parent_id=? WHERE id=?', [mapped, String(child.id)])
      }
    }
    return { newProjectId, ops, copied }
  }

  async save(): Promise<void> {
    const bytes = this.db.export()
    await writeFile(path.join(this.rootDir, 'solidgit.db'), Buffer.from(bytes))
  }

  async close(): Promise<void> {
    await this.save()
    this.db.close()
  }
}