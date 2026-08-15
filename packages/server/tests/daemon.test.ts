import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ServerClient } from '../src/http-client'
import { withoutDaemon } from '../src/commands/serve'

const require = createRequire(import.meta.url)

let tmp: string

beforeAll(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'solidsync-daemon-'))
})

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true })
})

/** Run the CLI in a subprocess and collect its output until it exits. */
function runCli(args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const tsxCli = require.resolve('tsx/cli')
  const cliEntry = path.join(__dirname, '..', 'src', 'cli.ts')
  const child: ChildProcess = spawn(process.execPath, [tsxCli, cliEntry, ...args], {
    cwd: path.join(__dirname, '..')
  })
  let stdout = ''
  let stderr = ''
  child.stdout?.on('data', (b) => {
    stdout += String(b)
  })
  child.stderr?.on('data', (b) => {
    stderr += String(b)
  })
  return new Promise((res) => {
    child.on('close', (code) => res({ code, stdout, stderr }))
  })
}

/** Start a --daemon server and wait for it to report its pid. */
async function startDaemon(dir: string, port: number): Promise<number> {
  const child: ChildProcess = spawn(
    process.execPath,
    [require.resolve('tsx/cli'), path.join(__dirname, '..', 'src', 'cli.ts'), 'serve', '--daemon', '--dir', dir, '--port', String(port), '--name', 'Daemon Shop'],
    { cwd: path.join(__dirname, '..') }
  )
  let stdout = ''
  let stderr = ''
  child.stdout?.on('data', (b) => {
    stdout += String(b)
  })
  child.stderr?.on('data', (b) => {
    stderr += String(b)
  })
  const deadline = Date.now() + 15000
  for (;;) {
    const m = /pid\s*:\s*(\d+)/.exec(stdout)
    if (m) return Number(m[1])
    if (Date.now() > deadline) {
      throw new Error(`daemon parent never reported a pid. stdout=${stdout!} stderr=${stderr}`)
    }
    await new Promise((r) => setTimeout(r, 100))
  }
}

describe('withoutDaemon', () => {
  it('keeps everything except the daemon flag', () => {
    expect(withoutDaemon(['dist/cli.js', 'serve', '--port', '3100', '--daemon'])).toEqual([
      'dist/cli.js',
      'serve',
      '--port',
      '3100'
    ])
  })

  it('also strips --daemon=true / --daemon=false forms', () => {
    expect(withoutDaemon(['serve', '--daemon=true'])).toEqual(['serve'])
    expect(withoutDaemon(['serve', '--daemon=false'])).toEqual(['serve'])
  })

  it('keeps a plain serve argv untouched', () => {
    expect(withoutDaemon(['dist/cli.js', 'serve', '--name', 'Shop'])).toEqual([
      'dist/cli.js',
      'serve',
      '--name',
      'Shop'
    ])
  })
})

describe('runDaemon', () => {
  it('starts a detached server, reports the pid, and answers health', async () => {
    const port = 14100 + Math.floor(Math.random() * 1000)
    const tsxCli = require.resolve('tsx/cli')
    const cliEntry = path.join(__dirname, '..', 'src', 'cli.ts')
    const dir = path.join(tmp, 'd1')

    const child: ChildProcess = spawn(
      process.execPath,
      [tsxCli, cliEntry, 'serve', '--daemon', '--dir', dir, '--port', String(port), '--name', 'Daemon Shop'],
      { cwd: path.join(__dirname, '..') }
    )
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (b) => {
      stdout += String(b)
    })
    child.stderr?.on('data', (b) => {
      stderr += String(b)
    })
    const exit = new Promise<number | null>((res) => {
      child.on('close', (code) => res(code))
    })

    const deadline = Date.now() + 15000
    let pid = -1
    for (;;) {
      const m = /pid\s*:\s*(\d+)/.exec(stdout)
      if (m) {
        pid = Number(m[1])
        break
      }
      if (Date.now() > deadline) {
        throw new Error(`daemon parent never reported a pid. stdout=${stdout!} stderr=${stderr}`)
      }
      await new Promise((r) => setTimeout(r, 100))
    }

    expect(pid).toBeGreaterThan(0)
    const api = new ServerClient(`http://127.0.0.1:${port}`, 'tester')
    const health = await api.health()
    expect(health.orgName).toBe('Daemon Shop')

    // The parent exited 0 after the child came up; the child is still serving.
    expect(await Promise.race([exit, new Promise((r) => setTimeout(r, 2000))])).toBe(0)

    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      /* already gone */
    }
    await new Promise((r) => setTimeout(r, 300))
    await expect(api.health()).rejects.toThrow()
  }, 30000)
})

describe('stop / restart', () => {
  it('stop kills the daemon and restart brings it back on the same port', async () => {
    const port = 15100 + Math.floor(Math.random() * 900)
    const dir = path.join(tmp, 'cycle')

    const pid1 = await startDaemon(dir, port)
    const api = new ServerClient(`http://127.0.0.1:${port}`, 'tester')
    expect((await api.health()).orgName).toBe('Daemon Shop')

    // stop
    const stopped = await runCli(['stop', '--dir', dir])
    expect(stopped.code).toBe(0)
    expect(stopped.stdout).toContain('server stopped')
    await new Promise((r) => setTimeout(r, 300))
    await expect(api.health()).rejects.toThrow()
    expect(pid1).toBeGreaterThan(0)

    // restart
    const restarted = await runCli(['restart', '--dir', dir])
    expect(restarted.code).toBe(0)
    expect(restarted.stdout).toContain('SolidSync server restarted')
    const health = await api.health()
    expect(health.orgName).toBe('Daemon Shop')

    // clean up
    const stopped2 = await runCli(['stop', '--dir', dir])
    expect(stopped2.code).toBe(0)
  }, 60000)

  it('stop reports a missing server without erroring the process', async () => {
    const dir = path.join(tmp, 'never-started')
    const res = await runCli(['stop', '--dir', dir])
    expect(res.code).toBe(1)
    expect(res.stderr).toContain('no running server')
  }, 30000)
})