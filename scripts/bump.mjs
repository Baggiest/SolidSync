#!/usr/bin/env node
// Bump the product version everywhere at once.
//
//   npm run bump -- 0.3.0          -> rewrite package.json files + source
//   npm run bump -- 0.3.0 --tag    -> ... and create `git tag v0.3.0`
//
// Keeps every version location in lockstep: the four package.json files, the
// package-lock.json entries, and packages/shared/src/version.ts (the single
// source of truth the server reads at runtime).

import { readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const args = process.argv.slice(2)
const version = args.find((a) => !a.startsWith('-'))
const makeTag = args.includes('--tag')

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('usage: npm run bump -- <X.Y.Z> [--tag]')
  process.exit(1)
}

const read = async (p) => JSON.parse(await readFile(p, 'utf8'))
const write = async (p, obj) => writeFile(p, JSON.stringify(obj, null, 2) + '\n')

const touched = []

const packageFiles = [
  path.join(root, 'package.json'),
  path.join(root, 'packages/client/package.json'),
  path.join(root, 'packages/server/package.json'),
  path.join(root, 'packages/shared/package.json')
]
for (const p of packageFiles) {
  const pkg = await read(p)
  pkg.version = version
  await write(p, pkg)
  touched.push(path.relative(root, p))
}

// lockfile: root version + each workspace package entry. Never touch the
// resolved dependency versions (undici, electron, …) — only our own packages.
const workspaceDirs = ['packages/client', 'packages/server', 'packages/shared']
const lockPath = path.join(root, 'package-lock.json')
const lock = await read(lockPath)
lock.version = version
for (const dir of workspaceDirs) {
  if (lock.packages?.[dir]) lock.packages[dir].version = version
}
await write(lockPath, lock)
touched.push(path.relative(root, lockPath))

// single source of truth the server reads at runtime
const sourcePath = path.join(root, 'packages/shared/src/version.ts')
await writeFile(sourcePath, `// Single source of truth for the product version. The CLI, the /api/health\n// endpoint and (via \`npm run bump\`) the package.json files all read this.\nexport const VERSION = '${version}'\n`)
touched.push(path.relative(root, sourcePath))

console.log(`Bumped to ${version}:`)
for (const f of touched) console.log(`  ${f}`)

if (makeTag) {
  const tag = `v${version}`
  execFileSync('git', ['tag', tag], { cwd: root, stdio: 'inherit' })
  console.log(`Created git tag ${tag}`)
}