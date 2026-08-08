import { spawn } from 'node:child_process'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { OrgStore } from '../store'
import type { CommandOptions } from '../cli'

/**
 * Snapshot the whole org (DB + per-project repos) into one tar.gz archive.
 * Uses the system `tar`/bsdtar, which ships with Windows 10+, macOS and Linux —
 * no extra npm dependency, and the archive opens in Explorer/macOS Finder.
 */
export async function runBackup(o: CommandOptions, outPath?: string): Promise<number> {
  if (!existsSync(o.dir)) {
    console.error(`org dir not found: ${o.dir} (run "solidsync-server init" or "serve" first)`)
    return 1
  }

  const store = await OrgStore.open(o.dir, o.name)
  await store.save()
  await store.close()

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const out = outPath
    ? path.resolve(outPath)
    : path.join(process.cwd(), `solidsync-backup-${stamp}.tar.gz`)

  await tar(out, o.dir)
  console.log(`Backup written: ${out}`)
  return 0
}

function tar(out: string, dir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('tar', ['-czf', out, '-C', dir, '.'], { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (b) => {
      stderr += String(b)
    })
    child.on('error', (err) => reject(new Error(`tar not available: ${err.message}`)))
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`tar failed (code ${code}): ${stderr.trim()}`))
    })
  })
}