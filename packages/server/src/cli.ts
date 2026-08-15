#!/usr/bin/env node
import os from 'node:os'
import path from 'node:path'
import { realpathSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { ServerClient } from './http-client'
import { runServe } from './commands/serve'
import { runInit } from './commands/init'
import { runHealth } from './commands/health'
import { runList } from './commands/list'
import { runImport } from './commands/import'
import { runStatus } from './commands/status'
import { runBranch } from './commands/branch'
import { runArchive, runUnarchive } from './commands/archive'
import { runBackup } from './commands/backup'
import { runVersion } from './commands/version'

export interface CommandOptions {
  dir: string
  port: number
  host: string
  name: string
  url: string
  user: string
  json: boolean
  tls: boolean
  tlsPort: number
  ca: string
  project?: string
  section?: string
  set?: string
}

export function envOrDefault(key: string, fallback: string): string {
  const v = process.env[key]
  return v && v.trim() !== '' ? v.trim() : fallback
}

/** Build a client for the client-ish commands, trusting the --ca cert if given. */
export async function makeClient(o: CommandOptions): Promise<ServerClient> {
  let ca: string | undefined
  if (o.ca) ca = await readFile(o.ca, 'utf8')
  return new ServerClient(o.url, o.user, ca)
}

function resolveOptions(raw: Record<string, string>): CommandOptions {
  const dir = raw.dir ?? envOrDefault('SOLIDSYNC_DIR', path.join(os.homedir(), '.solidsync'))
  const port = Number(raw.port ?? envOrDefault('SOLIDSYNC_PORT', '3020'))
  const host = raw.host ?? envOrDefault('SOLIDSYNC_HOST', '0.0.0.0')
  const name = raw.name ?? envOrDefault('SOLIDSYNC_NAME', 'Shop')
  const user = raw.user ?? envOrDefault('SOLIDSYNC_USER', 'you')
  const tls = raw.tls === 'true' || envOrDefault('SOLIDSYNC_TLS', 'false') === 'true'
  const tlsPort = Number(raw['tls-port'] ?? envOrDefault('SOLIDSYNC_TLS_PORT', '3443'))
  const ca = raw.ca ?? envOrDefault('SOLIDSYNC_CA', '')
  const url = raw.url ?? `http://127.0.0.1:${port}`
  return {
    dir,
    port,
    host,
    name,
    url,
    user,
    json: raw.json === 'true',
    tls,
    tlsPort,
    ca,
    project: raw.project,
    section: raw.section,
    set: raw.set
  }
}

const USAGE = `solidsync-server — the SolidSync shop server (headless, universal)

Usage:
  solidsync-server <command> [options]

Commands:
  serve           Run the server and keep it in the foreground.
                  Defaults are fine for most shops; clients only need the URL.
  init            Create/repair the org data folder, then exit.
  health          Print server health as JSON (handy for scripting + smoke tests).
  list            Print the org tree (projects -> sections -> parts). Use --json to parse.
  import FILE     Throw a file into a section on a running server.
  status PARTID   Print how current a part is; --set green|yellow|red stamps it.
  branch PROJECT  Start an independent copy of a project (the "my own copy" idea).
  archive PROJECT Move a project out of the active list (server-side admin op).
  unarchive PROJECT  Bring an archived project back into the active list.
  backup          Snapshot the whole org (DB + repos) into one archive.
  version         Print the server version.

Common options:
  --dir PATH      Org data folder (default $HOME/.solidsync, or $SOLIDSYNC_DIR).
  --port N        Port for serve (default 3020, or $SOLIDSYNC_PORT).
  --host IP       Bind address for serve (default 0.0.0.0, or $SOLIDSYNC_HOST).
  --name NAME     Org name shown in the UI (default "Shop", or $SOLIDSYNC_NAME).
  --url URL       Server base URL for client-ish commands
                  (default http://127.0.0.1:<port> from the settings above).
  --user NAME     Your name (default "you", or $SOLIDSYNC_USER).
  --json          Machine-readable output where supported.
TLS:
  --tls           Also serve HTTPS (on --tls-port). Generates a throwaway CA +
                  server cert into <dir>/tls on first run; clients pin the CA.
  --tls-port N    HTTPS port for serve (default 3443, or $SOLIDSYNC_TLS_PORT).
  --ca PATH       CA certificate file for client-ish commands over https, so
                  they trust a self-signed server (or $SOLIDSYNC_CA).
  -h, --help      Show this help.
`

export function parseArgs(argv: string[]): { command: string; opts: Record<string, string>; positionals: string[] } {
  const opts: Record<string, string> = {}
  const positionals: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--help' || a === '-h') return { command: 'help', opts, positionals }
    if (a === '--version') return { command: 'version', opts, positionals }
    if (a.startsWith('--')) {
      let key = a.slice(2)
      let val: string | true = 'true'
      const eq = key.indexOf('=')
      if (eq !== -1) {
        val = key.slice(eq + 1)
        key = key.slice(0, eq)
      } else {
        const next = argv[i + 1]
        if (next !== undefined && !next.startsWith('--')) {
          val = next
          i++
        }
      }
      opts[key] = String(val)
    } else {
      positionals.push(a)
    }
  }
  return { command: positionals[0] ?? 'help', opts, positionals }
}

export async function main(argv: string[]): Promise<number> {
  const { command, opts, positionals } = parseArgs(argv)
  if (command === 'help') {
    console.log(USAGE)
    return 0
  }
  const o = resolveOptions(opts)
  switch (command) {
    case 'serve': return runServe(o)
    case 'init': return runInit(o)
    case 'health': return runHealth(o)
    case 'list': return runList(o)
    case 'import': return runImport(o, positionals[1])
    case 'status': return runStatus(o, positionals[1])
    case 'branch': return runBranch(o, positionals[1], positionals[2])
    case 'archive': return runArchive(o, positionals[1])
    case 'unarchive': return runUnarchive(o, positionals[1])
    case 'backup': return runBackup(o, positionals[1])
    case 'version': return runVersion()
    default:
      console.error(`unknown command "${command}"`)
      console.log(USAGE)
      return 1
  }
}

const isEntry = ((): boolean => {
  if (typeof process === 'undefined') return false
  if (typeof process.argv[1] !== 'string' || process.argv[1] === '') return false
  if (typeof __filename === 'string') {
    try {
      return (
        path.resolve(realpathSync(__filename)) === path.resolve(realpathSync(process.argv[1]))
      )
    } catch {
      return false
    }
  }
  return import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`
})()

if (isEntry) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(err instanceof Error ? err.message : String(err))
      process.exit(2)
    }
  )
}