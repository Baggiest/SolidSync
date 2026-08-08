import { build } from 'esbuild'
import { cp, mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const outDir = join(root, 'dist')
const req = createRequire(import.meta.url)

await mkdir(outDir, { recursive: true })

// The workspace root package is "type": "module", but the bundle is CJS
// (esbuild CJS output plays nice with the CJS npm packages it inlines). Mark
// dist/ as commonjs so node runs dist/cli.js directly.
await writeFile(join(outDir, 'package.json'), JSON.stringify({ type: 'commonjs' }, null, 2))

await build({
  entryPoints: [join(root, 'src/cli.ts')],
  outfile: join(outDir, 'cli.js'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  logLevel: 'info'
})

// sql.js loads its wasm at runtime; copy it beside the bundle so the dist
// folder is self-contained. Resolve through node (handles workspace hoisting).
const wasmPath = req.resolve('sql.js/dist/sql-wasm.wasm')
await cp(wasmPath, join(outDir, 'sql-wasm.wasm'))

console.log('built dist/cli.js (+ sql-wasm.wasm)')