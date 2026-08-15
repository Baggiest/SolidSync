#!/usr/bin/env node
// One-command release: clean, build everything, and gather the artifacts you
// actually upload to the GitHub release page into ./release.
//
//   npm run ship:all        -> build client (win+linux) and server, collect
//
// The collect step mirrors the table in RELEASE.md: it globs each known
// artifact out of packages/client/dist and copies the whole self-contained
// server dist folder alongside them.

import { execSync } from 'node:child_process'
import { cp, mkdir, readFile, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const clientDist = path.join(root, 'packages/client/dist')
const serverDist = path.join(root, 'packages/server/dist')
const release = path.join(root, 'release')

const run = (cmd) => {
  console.log(`\n$ ${cmd}`)
  execSync(cmd, { cwd: root, stdio: 'inherit' })
}

const version = (await readFile(path.join(root, 'packages/client/package.json'), 'utf8')).match(/"version":\s*"([^"]+)"/)?.[1]
if (!version) throw new Error('could not read client version')

// 1. Clean stale build output (matches RELEASE.md step 2).
await rm(clientDist, { recursive: true, force: true })
await rm(path.join(root, 'packages/client/out'), { recursive: true, force: true })
await rm(serverDist, { recursive: true, force: true })
console.log('cleaned stale build output')

// 2. Build everything.
run('npm run build:win')       // client: NSIS installer + portable zip
run('npm run build:linux')     // client: .deb
run('npm run build:server')    // server: esbuild -> dist

// 3. Collect into ./release.
await rm(release, { recursive: true, force: true })
await mkdir(release, { recursive: true })

const distFiles = await readdir(clientDist)

const artifactPatterns = [
  /^SolidSync-\d+\.\d+\.\d+-amd64\.deb$/,
  /^SolidSync-\d+\.\d+\.\d+-x64\.exe$/,
  /^SolidSync-\d+\.\d+\.\d+-x64\.exe\.blockmap$/,
  /^SolidSync-\d+\.\d+\.\d+-x64-portable\.zip$/,
  /^latest(?:-linux)?\.yml$/
]

let copied = 0
for (const name of distFiles) {
  if (artifactPatterns.some((re) => re.test(name))) {
    await cp(path.join(clientDist, name), path.join(release, name))
    console.log(`  release/${name}`)
    copied++
  }
}

// Server dist is fully self-contained (cli.js + sql-wasm.wasm + package.json).
// Keep the folder name versioned so the GitHub asset names stay unambiguous.
const serverOut = path.join(release, `solidsync-server-${version}`)
await cp(serverDist, serverOut, { recursive: true })
console.log(`  release/solidsync-server-${version}/`)

console.log(`\ndone: ${copied} installer/update files + server bundle in ${path.relative(root, release)}/`)
