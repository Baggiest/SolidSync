import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import initSqlJs, { type SqlJsStatic } from 'sql.js'

let SQL: SqlJsStatic | null = null

// The server runs from source (vitest/tsx, ESM) and bundled (dist/cli.js,
// CJS where `import.meta` is neutralised by esbuild). Both fall back to the
// module's own URL.
function moduleHref(): string {
  return typeof __filename === 'string'
    ? pathToFileURL(__filename).href
    : (import.meta.url as string)
}

function requireFromHere(): NodeRequire {
  return createRequire(moduleHref())
}

function hereDir(): string {
  return dirname(fileURLToPath(moduleHref()))
}

/**
 * sql.js ships a wasm binary; find it at runtime whether the server runs from
 * source (node_modules), as a bundled single file (dist/cli.js with a copied
 * sql-wasm.wasm beside it), or from a repo checkout's root.
 */
async function locateWasm(): Promise<string> {
  const candidates: string[] = []
  try {
    const entry = requireFromHere().resolve('sql.js')
    candidates.push(join(dirname(entry), 'sql-wasm.wasm'))
  } catch {
    /* sql.js isn't resolvable next to a bundle */
  }
  candidates.push(join(hereDir(), 'sql-wasm.wasm'))
  candidates.push(join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'))
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  throw new Error(
    'sql.js wasm binary (sql-wasm.wasm) not found — install sql.js or copy it next to the server bundle'
  )
}

export async function loadSqlJs(): Promise<SqlJsStatic> {
  if (SQL) return SQL
  const wasm = await locateWasm()
  SQL = await initSqlJs({ locateFile: () => wasm })
  return SQL
}