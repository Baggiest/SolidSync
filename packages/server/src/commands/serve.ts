import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises'
import { mkdirSync, closeSync, openSync } from 'node:fs'
import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { OrgStore } from '../store'
import { createApp } from '../app'
import { startHttp, startHttps, lanIPs, type ServerHandle } from '../http'
import { ensureTls, type TlsMaterial } from '../tls'
import { ServerClient } from '../http-client'
import type { CommandOptions } from '../cli'

export async function runServe(o: CommandOptions): Promise<number> {
  if (o.daemon) return runDaemon(o)
  await mkdir(o.dir, { recursive: true })
  const store = await OrgStore.open(o.dir, o.name, o.hostname)

  const pidFile = o.pidfile ? path.resolve(o.pidfile) : null
  if (pidFile) await writeFile(pidFile, String(process.pid) + '\n')

  const hosts = tlsHosts(o.host)
  const tls: TlsMaterial | null = o.tls ? await ensureTls(o.dir, hosts) : null
  const app = createApp(store, tls ? { caPem: tls.caPem } : {})

  const handles: ServerHandle[] = []
  const httpHandle = await startHttp(app, o.port, o.host)
  handles.push(httpHandle)
  let tlsHandle: ServerHandle | null = null
  if (tls) {
    tlsHandle = await startHttps(app, o.tlsPort, o.host, { key: tls.keyPem, cert: tls.certPem })
    handles.push(tlsHandle)
  }

  const ips = lanIPs()
  console.log(`SolidSync server "${store.getHostName()}" (org "${store.getOrgName()}", rev ${store.getRev()})`)
  console.log(`  org data : ${o.dir}`)
  console.log(`  listening: http://${httpHandle.host}:${httpHandle.port}`)
  if (tlsHandle) console.log(`             https://${tlsHandle.host}:${tlsHandle.port}`)
  console.log(`  tell everyone: http://${ips[0] ?? '127.0.0.1'}:${httpHandle.port}`)
  if (tls) {
    console.log(`  TLS (recommended): https://${ips[0] ?? '127.0.0.1'}:${tlsHandle!.port}`)
    console.log(`  TLS CA: ${tls.tlsDir}/ca.pem  (clients show this fingerprint on first connect)`)
    console.log(`  CA fingerprint: ${tls.fingerprint}`)
  }
  console.log('  press Ctrl+C to stop')

  const shutdown = async (): Promise<void> => {
    console.log('\nshutting down…')
    await Promise.all(handles.map((h) => h.close()))
    await store.close()
    if (pidFile) await unlink(pidFile).catch(() => {})
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown())
  process.on('SIGTERM', () => void shutdown())

  await new Promise<void>(() => {
    /* keep the process alive until a signal arrives */
  })
  return 0
}

function tlsHosts(host: string): string[] {
  return [host, ...lanIPs(), '127.0.0.1', 'localhost']
}

/**
 * Strip the daemon flag from an argv list so a spawned child runs in the
 * foreground again. Handles `--daemon`, `--daemon=true/false`, and re-spawning
 * from a `process.argv` that includes the script path at index 0.
 */
export function withoutDaemon(argv: string[]): string[] {
  return argv.filter((a) => a !== '--daemon' && !a.startsWith('--daemon='))
}

/** File a --daemon server persists so `stop` / `restart` can find it. */
export const LAUNCH_FILE = 'server.launch.json'

export interface DaemonHealth {
  dir: string
  host: string
  port: number
  tls: boolean
  tlsPort: number
  ca: string
  user: string
}

export interface LaunchRecord {
  pid: number
  cwd: string
  execArgv: string[]
  argv: string[]
  logPath: string
  pidPath: string
  health: DaemonHealth
}

/** Default pid path for a background server (overridable via --pidfile). */
export function pidPath(o: Pick<CommandOptions, 'dir' | 'pidfile'>): string {
  return o.pidfile ? path.resolve(o.pidfile) : path.join(o.dir, 'server.pid')
}

/** Persist a launch record so stop/restart can find and replay the daemon. */
export async function writeLaunch(record: LaunchRecord): Promise<void> {
  try {
    await writeFile(path.join(record.health.dir, LAUNCH_FILE), JSON.stringify(record, null, 2))
  } catch {
    /* best-effort: stop/restart fall back to the pid file */
  }
}

/**
 * Detach into the background: re-spawn this same process (minus --daemon) as a
 * detached child, redirect its stdout/stderr to a log file, wait until the
 * server answers /api/health, then exit 0.
 */
export async function runDaemon(o: CommandOptions): Promise<number> {
  await mkdir(o.dir, { recursive: true })
  const pidFile = pidPath(o)
  const logPath = o.log ? path.resolve(o.log) : path.join(o.dir, 'server.log')

  // Rebuild the current argv without --daemon so the child runs in the
  // foreground (same command, same options, same env). Preserve execArgv so a
  // dev run under tsx re-spawns with the same loader. The child writes its own
  // pid to --pidfile on startup and removes it on shutdown.
  const childArgv = withoutDaemon([...process.argv.slice(1), '--pidfile', pidFile])
  const record: LaunchRecord = {
    pid: 0,
    cwd: process.cwd(),
    execArgv: process.execArgv,
    argv: childArgv,
    logPath,
    pidPath: pidFile,
    health: { dir: o.dir, host: o.host, port: o.port, tls: o.tls, tlsPort: o.tlsPort, ca: o.ca, user: o.user }
  }

  const child = launchBackground(record)
  if (!child) return 1
  record.pid = child.pid
  await writeLaunch(record)

  const ok = await waitForHealth(record, logPath)
  if (!ok) return 1

  const ips = lanIPs()
  const h = record.health
  console.log(`SolidSync server running in the background`)
  console.log(`  pid      : ${child.pid}`)
  console.log(`  log      : ${logPath}`)
  console.log(`  tell everyone: ${h.tls ? 'https' : 'http'}://${ips[0] ?? '127.0.0.1'}:${h.tls ? h.tlsPort : h.port}`)
  console.log(`  stop it  : solidsync-server stop${h.dir !== path.join(os.homedir(), '.solidsync') ? ` --dir ${h.dir}` : ''}`)
  console.log(`             or kill ${child.pid}`)
  return 0
}

export function launchBackground(record: LaunchRecord): { pid: number } | null {
  mkdirSync(path.dirname(record.logPath), { recursive: true })
  const logFd = openSync(record.logPath, 'a')
  const child = spawn(process.execPath, [...record.execArgv, ...record.argv], {
    detached: true,
    cwd: record.cwd,
    stdio: ['ignore', logFd, logFd],
    env: { ...process.env, SOLIDSYNC_DAEMON: 'false' }
  })
  child.on('error', () => {
    /* spawn failed; health poll will time out and report via the log */
  })
  child.unref()
  closeSync(logFd)
  if (!child.pid) return null
  return { pid: child.pid }
}

export async function waitForHealth(record: LaunchRecord, logPath: string): Promise<boolean> {
  const h = record.health
  const probeHost = h.host === '0.0.0.0' ? '127.0.0.1' : h.host
  const baseUrl = `${h.tls ? 'https' : 'http'}://${probeHost}:${h.tls ? h.tlsPort : h.port}`
  const client = new ServerClient(baseUrl, h.user, await daemonCa(h))
  const deadline = Date.now() + 15000
  for (;;) {
    try {
      await client.health()
      return true
    } catch {
      if (Date.now() > deadline) {
        console.error(`background server didn't come up in time; check the log: ${logPath}`)
        try {
          if (record.pid) process.kill(record.pid)
        } catch {
          /* already dead */
        }
        return false
      }
      await new Promise((r) => setTimeout(r, 250))
    }
  }
}

/** CA PEM for the daemon health check: --ca wins, else the org's own generated CA. */
async function daemonCa(h: DaemonHealth): Promise<string | undefined> {
  if (h.ca) return readFile(h.ca, 'utf8')
  if (h.tls) {
    const caPath = path.join(h.dir, 'tls', 'ca.pem')
    try {
      return readFile(caPath, 'utf8')
    } catch {
      return undefined
    }
  }
  return undefined
}
