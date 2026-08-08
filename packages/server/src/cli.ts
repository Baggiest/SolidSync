#!/usr/bin/env node
import os from 'node:os'
import path from 'node:path'
import { runServe } from './commands/serve'
import { runInit } from './commands/init'
import { runHealth } from './commands/health'
import { runList } from './commands/list'
import { runImport } from './commands/import'
import { runStatus } from './commands/status'
import { runBranch } from './commands/branch'
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
  project?: string
  section?: string
  set?: string
}

export function envOrDefault(key: string, fallback: string): string {
  const v = process.env[key]
  return v && v.trim() !== '' ? v.trim() : fallback
}

function resolveOptions(raw: Record<string, string>): CommandOptions {
  const dir = raw.dir ?? envOrDefault('SOLIDSYNC_DIR', path.join(os.homedir(), '.solidsync'))
  const port = Number(raw.port ?? envOrDefault('SOLIDSYNC_PORT', '3020'))
  const host = raw.host ?? envOrDefault('SOLIDSYNC_HOST', '0.0.0.0')
  const name = raw.name ?? envOrDefault('SOLIDSYNC_NAME', 'Shop')
  const user = raw.user ?? envOrDefault('SOLIDSYNC_USER', 'you')
  const url = raw.url ?? `http://127.0.0.1:${port}`
  return {
    dir,
    port,
    host,
    name,
    url,
    user,
    json: raw.json === 'true',
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
    case 'backup': return runBackup(o, positionals[1])
    case 'version': return runVersion()
    default:
      console.error(`unknown command "${command}"`)
      console.log(USAGE)
      return 1
  }
}

const isEntry =
  typeof process !== 'undefined' &&
  typeof process.argv[1] === 'string' &&
  process.argv[1] &&
  (typeof __filename === 'string'
    ? path.resolve(__filename) === path.resolve(process.argv[1])
    : import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`)

if (isEntry) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(err instanceof Error ? err.message : String(err))
      process.exit(2)
    }
  )
}