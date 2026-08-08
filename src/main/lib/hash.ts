import { createHash } from 'node:crypto'
import { promises as fsp } from 'node:fs'

export async function sha1File(filePath: string): Promise<string> {
  const hash = createHash('sha1')
  const data = await fsp.readFile(filePath)
  hash.update(data)
  return hash.digest('hex')
}

export function hashBytes(buf: Buffer): string {
  return createHash('sha1').update(buf).digest('hex')
}

/** Last 6 hex chars of the file hash become the Part ID (spec §4). */
export function id6(hex: string): string {
  return hex.slice(-6).toLowerCase()
}

/** Stable, unique version id: epoch-millis + hash6 of the bytes. */
export function makeVersionId(fileHex: string): string {
  return `${Date.now()}-${id6(fileHex)}`
}