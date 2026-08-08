import { promises as fsp } from 'node:fs'
import path from 'node:path'
import * as git from 'isomorphic-git'
import type { ProjectInfo } from '@solidsync/shared'

export interface MirrorIndex {
  rev: number
  files: Record<string, { versionId: string; size: number }>
}

const AUTHOR = (name: string) => ({
  name,
  email: `${name}@mirror`
})

export function versionRelPath(sectionId: string, partId: string, versionId: string, ext: string): string {
  return `parts/${sectionId}/${partId}/versions/${versionId}${ext ? '.' + ext : ''}`
}

export function partExt(fileName: string): string {
  return path.extname(fileName).replace(/^\./, '').toLowerCase()
}

export interface DesiredFile {
  rel: string
  partId: string
  sectionId: string
  versionId: string
  fileName: string
  size: number
}

/**
 * Local working copy of the org's versioned files, backed by one isomorphic-git
 * repo per project. Every version this machine pulls is committed locally, so
 * each client keeps a linear local history and keeps browsing offline.
 */
export class Mirror {
  constructor(
    readonly root: string,
    readonly username: string
  ) {}

  projectDir(projectId: string): string {
    return path.join(this.root, projectId)
  }

  private indexPath(projectId: string): string {
    return path.join(this.projectDir(projectId), '.solidsync-mirror.json')
  }

  abs(projectId: string, rel: string): string {
    return path.join(this.projectDir(projectId), rel)
  }

  /** Collect every version file the server snapshot wants, per project. */
  static desiredFiles(project: ProjectInfo): DesiredFile[] {
    const out: DesiredFile[] = []
    for (const section of project.sections) {
      for (const part of section.parts) {
        const ext = partExt(part.name)
        for (const version of part.versions) {
          out.push({
            rel: versionRelPath(section.id, part.id, version.id, ext),
            partId: part.id,
            sectionId: section.id,
            versionId: version.id,
            fileName: version.fileName,
            size: version.size
          })
        }
      }
    }
    return out
  }

  async ensureProject(projectId: string): Promise<void> {
    const dir = this.projectDir(projectId)
    await fsp.mkdir(dir, { recursive: true })
    try {
      await fsp.access(path.join(dir, '.git'))
    } catch {
      await git.init({ fs: fsp, dir, defaultBranch: 'main' })
    }
    const log = await git.log({ fs: fsp, dir, depth: 1 }).catch(() => [])
    if (log.length === 0) {
      // Plant a neutral root commit so later file adds are never the first commit.
      await git.commit({
        fs: fsp,
        dir,
        message: 'Started working copy',
        author: AUTHOR(this.username),
        committer: AUTHOR(this.username)
      })
    }
    await this.saveIndex(projectId, await this.loadIndex(projectId))
  }

  async isTracked(projectId: string, rel: string): Promise<boolean> {
    return fsp.access(this.abs(projectId, rel)).then(
      () => true,
      () => false
    )
  }

  async storeFile(projectId: string, rel: string, data: Buffer, message: string): Promise<void> {
    const dir = this.projectDir(projectId)
    const target = this.abs(projectId, rel)
    await fsp.mkdir(path.dirname(target), { recursive: true })
    await fsp.writeFile(target, data)
    try {
      await git.add({ fs: fsp, dir, filepath: rel })
      await git.commit({
        fs: fsp,
        dir,
        message,
        author: AUTHOR(this.username),
        committer: AUTHOR(this.username)
      })
    } catch {
      /* identical write or transient fs error — not fatal */
    }
  }

  async removeFile(projectId: string, rel: string): Promise<void> {
    try {
      await fsp.unlink(this.abs(projectId, rel))
      await git.remove({ fs: fsp, dir: this.projectDir(projectId), filepath: rel })
      await git.commit({
        fs: fsp,
        dir: this.projectDir(projectId),
        message: `Stop tracking ${rel}`,
        author: AUTHOR(this.username),
        committer: AUTHOR(this.username)
      })
    } catch {
      /* best effort */
    }
  }

  async loadIndex(projectId: string): Promise<MirrorIndex> {
    try {
      const raw = await fsp.readFile(this.indexPath(projectId), 'utf8')
      return JSON.parse(raw) as MirrorIndex
    } catch {
      return { rev: 0, files: {} }
    }
  }

  async saveIndex(projectId: string, index: MirrorIndex): Promise<void> {
    await fsp.writeFile(this.indexPath(projectId), JSON.stringify(index, null, 2))
  }
}