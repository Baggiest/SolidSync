import path from 'node:path'
import { readFile, unlink } from 'node:fs/promises'
import {
  pidPath,
  launchBackground,
  waitForHealth,
  writeLaunch,
  LAUNCH_FILE,
  type LaunchRecord
} from './serve'
import type { CommandOptions } from '../cli'

type StopOptions = Pick<CommandOptions, 'dir' | 'pidfile' | 'json'>

async function readLaunch(dir: string): Promise<LaunchRecord | null> {
  try {
    return JSON.parse(await readFile(path.join(dir, LAUNCH_FILE), 'utf8')) as LaunchRecord
  } catch {
    return null
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function readPid(pidPath: string): Promise<number | null> {
  try {
    const raw = (await readFile(pidPath, 'utf8')).trim()
    const pid = Number(raw)
    return Number.isInteger(pid) && pid > 0 ? pid : null
  } catch {
    return null
  }
}

async function removePid(o: StopOptions): Promise<void> {
  const pidFile = pidPath(o)
  await unlink(pidFile).catch(() => {})
}

/**
 * Stop a background (--daemon) server. Locates it via the pid file (or the
 * launch record's recorded path), sends SIGTERM, waits for it to exit, and
 * cleans up the pid file. The launch record is kept so `restart` can replay
 * the original options.
 */
export async function runStop(o: StopOptions): Promise<number> {
  const launch = await readLaunch(o.dir)
  const pidFile = launch?.pidPath ?? pidPath(o)
  const pid = (await readPid(pidFile)) ?? launch?.pid ?? null

  if (!pid) {
    if (o.json) console.log(JSON.stringify({ ok: false, error: 'no running server found' }))
    else console.error(`no running server found (no pid at ${pidFile})`)
    return 1
  }
  if (!isAlive(pid)) {
    await removePid(o)
    if (o.json) console.log(JSON.stringify({ ok: false, error: `pid ${pid} is not running` }))
    else console.error(`pid ${pid} is not running; cleaned up stale pid file`)
    return 1
  }

  if (!o.json) console.log(`stopping SolidSync server (pid ${pid})…`)
  process.kill(pid, 'SIGTERM')

  const deadline = Date.now() + 15000
  while (isAlive(pid) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200))
  }

  if (isAlive(pid)) {
    console.error(`pid ${pid} didn't stop in time; send SIGKILL`)
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      /* gone */
    }
    return 1
  }

  await removePid(o)
  if (o.json) console.log(JSON.stringify({ ok: true, pid }))
  else console.log('server stopped')
  return 0
}

/**
 * Restart a background server: read the launch record from the previous
 * --daemon run, stop the old process if any, and re-spawn it with the exact
 * same argv / env / cwd it was started with.
 */
export async function runRestart(o: CommandOptions): Promise<number> {
  const launch = await readLaunch(o.dir)
  if (!launch) {
    if (o.json) console.log(JSON.stringify({ ok: false, error: `no launch record at ${path.join(o.dir, LAUNCH_FILE)}` }))
    else console.error(`no launch record at ${path.join(o.dir, LAUNCH_FILE)} — was the server started with --daemon?`)
    return 1
  }

  // Stop the old instance (best effort; it may already be gone).
  if (launch.pid && isAlive(launch.pid)) {
    await runStop(o)
  } else {
    await removePid(o)
  }

  const child = launchBackground(launch)
  if (!child) {
    if (o.json) console.log(JSON.stringify({ ok: false, error: 'failed to spawn server' }))
    else console.error('failed to spawn server')
    return 1
  }
  launch.pid = child.pid
  await writeLaunch(launch)

  const ok = await waitForHealth(launch, launch.logPath)
  if (!ok) {
    if (o.json) console.log(JSON.stringify({ ok: false, error: 'server did not come up; see log' }))
    return 1
  }

  if (o.json) {
    console.log(JSON.stringify({ ok: true, pid: child.pid, log: launch.logPath }))
  } else {
    console.log(`SolidSync server restarted`)
    console.log(`  pid      : ${child.pid}`)
    console.log(`  log      : ${launch.logPath}`)
    console.log(`  stop it  : solidsync-server stop${o.dir !== path.join(process.env.HOME ?? '', '.solidsync') ? ` --dir ${o.dir}` : ''}`)
  }
  return 0
}