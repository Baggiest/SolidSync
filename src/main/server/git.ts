import { execFile } from 'node:child_process'
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileP = promisify(execFile)

export const GIT_IDENTITY = { name: 'SolidGit Server', email: 'solidgit@local' }

export class GitError extends Error {}

/**
 * Server-side git usage is deliberately tiny: init, add, commit, log,
 * cat-file. The org's version history lives in per-project git repos managed
 * with the real git binary (bulletproof on the host machine) via child_process.
 */
export class Repo {
  constructor(readonly dir: string) {}

  async ensureInit(): Promise<void> {
    await fsp.mkdir(this.dir, { recursive: true })
    if (!(await this.isRepo())) {
      await this.run(['init', '-b', 'main'])
      await this.run(['config', 'user.name', GIT_IDENTITY.name])
      await this.run(['config', 'user.email', GIT_IDENTITY.email])
    }
  }

  async isRepo(): Promise<boolean> {
    return fsp
      .access(path.join(this.dir, '.git'))
      .then(() => true)
      .catch(() => false)
  }

  private async run(args: string[]): Promise<string> {
    try {
      const { stdout, stderr } = await execFileP('git', args, {
        cwd: this.dir,
        maxBuffer: 64 * 1024 * 1024,
        windowsHide: true
      })
      if (stderr && stderr.length > 0 && !stdout) throw new GitError(stderr.trim())
      return stdout.trim()
    } catch (err) {
      const message =
        err instanceof Error && 'code' in err && (err as any).code === 'ENOENT'
          ? 'git executable not found. SolidGit needs git installed on the server machine.'
          : err instanceof Error
            ? err.message
            : String(err)
      throw new GitError(message)
    }
  }

  /** Stage a set of repo-relative paths (posix) and commit them. */
  async commitPaths(relPaths: string[], message: string): Promise<string> {
    if (relPaths.length === 0) return ''
    for (const rel of relPaths) {
      await this.run(['add', '--', rel])
    }
    const out = await this.run(['commit', '-m', message])
    const m = out.match(/^\[[^\]]+\s([0-9a-f]{7,40})/m)
    return m ? m[1] : ''
  }

  /** Commit every pending working-tree change (safe for store-level bumps). */
  async commitAll(message: string): Promise<string> {
    await this.run(['add', '-A'])
    const out = await this.run(['commit', '-m', message])
    const m = out.match(/^\[[^\]]+\s([0-9a-f]{7,40})/m)
    return m ? m[1] : ''
  }

  async hasChanges(): Promise<boolean> {
    const out = await this.run(['status', '--porcelain', '-uno'])
    return out.length > 0
  }

  /** Author tuples for "last modified by". The org keeps authorship in the DB,
   * but we also record it on each version commit so git history is complete. */
  async lastCommitMeta(relPath: string): Promise<{ hash: string; when: string; author: string }> {
    try {
      const out = await this.run([
        'log',
        '-1',
        '--format=%H%n%aI%n%an',
        '--',
        relPath
      ])
      const [hash, when, author] = out.split('\n')
      return { hash: hash ?? '', when: when ?? '', author: author ?? '' }
    } catch {
      return { hash: '', when: '', author: '' }
    }
  }

  /** Read a file's content from git history by commit hash + repo path. */
  async readFromHistory(commit: string, relPath: string): Promise<Buffer | null> {
    try {
      const { stdout, stderr } = await execFileP(
        'git',
        ['show', `${commit}:${relPath}`],
        { cwd: this.dir, maxBuffer: 512 * 1024 * 1024, windowsHide: true, encoding: 'buffer' }
      )
      if (stderr && stderr.length > 0) return null
      return Buffer.from(stdout)
    } catch {
      return null
    }
  }

  async hasFile(relPath: string): Promise<boolean> {
    return fsp
      .access(path.join(this.dir, relPath))
      .then(() => true)
      .catch(() => false)
  }
}