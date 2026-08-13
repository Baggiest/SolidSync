import { createHash } from 'node:crypto'
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import { fetch as undiciFetch, Agent } from 'undici'

/** SHA-256 fingerprint of a PEM certificate, formatted as hex pairs (AB:CD:…). */
export function fingerprintPem(pem: string): string {
  const der = pem
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('---'))
    .join('')
  const digest = createHash('sha256').update(Buffer.from(der, 'base64')).digest()
  return digest.toString('hex').toUpperCase().match(/.{2}/g)?.join(':') ?? ''
}

/**
 * Per-machine store for the shop server's CA certificate. First contact is
 * TOFU (trust on first use): the user confirms the server's fingerprint once,
 * the CA is pinned here, and every later connection verifies against it.
 */
export class TlsTrust {
  constructor(private readonly root: string) {}

  private caFile(): string {
    return path.join(this.root, 'server-ca.pem')
  }

  async loadCaPem(): Promise<string | null> {
    try {
      return await fsp.readFile(this.caFile(), 'utf8')
    } catch {
      return null
    }
  }

  async storeCaPem(pem: string): Promise<void> {
    await fsp.writeFile(this.caFile(), pem, 'utf8')
  }

  async clearCaPem(): Promise<void> {
    await fsp.unlink(this.caFile()).catch(() => undefined)
  }

  async status(): Promise<{ trusted: boolean; fingerprint: string | null }> {
    const pem = await this.loadCaPem()
    return { trusted: pem !== null, fingerprint: pem ? fingerprintPem(pem) : null }
  }
}

/** Fetch against a server whose CA we have already pinned. */
export function pinnedAgent(caPem: string): Agent {
  return new Agent({ connect: { ca: [caPem] } })
}

/** One-shot insecure fetch used to read the CA for the TOFU prompt. */
export async function fetchServerCa(serverIp: string, port: number): Promise<{ pem: string; fingerprint: string }> {
  const agent = new Agent({ connect: { rejectUnauthorized: false } })
  try {
    const res = await undiciFetch(`https://${serverIp}:${port}/tls/ca.pem`, {
      dispatcher: agent,
      signal: AbortSignal.timeout(10000)
    })
    if (!res.ok) throw new Error(`server answered ${res.status} instead of the CA`)
    const pem = await res.text()
    if (!pem.includes('BEGIN CERTIFICATE')) throw new Error('server did not present a certificate')
    return { pem, fingerprint: fingerprintPem(pem) }
  } finally {
    agent.close()
  }
}
