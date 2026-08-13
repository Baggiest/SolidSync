import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import selfsigned from 'selfsigned'

export interface TlsMaterial {
  caPem: string
  certPem: string
  keyPem: string
  fingerprint: string
  tlsDir: string
}

/** SHA-256 fingerprint of a PEM certificate, formatted as hex pairs (AB:CD:…). */
export function fingerprintPem(pem: string): string {
  const der = pem
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('---'))
    .join('')
  const digest = createHash('sha256').update(Buffer.from(der, 'base64')).digest()
  return digest.toString('hex').toUpperCase().match(/.{2}/g)?.join(':') ?? ''
}

const CA_CN = 'SolidSync Org CA'
const SERVER_CN = 'solidsync-server'
const DAYS = 825 // ~2.3 years; matches a common internal-CA lifetime

const notAfterDate = (): Date => {
  const d = new Date()
  d.setDate(d.getDate() + DAYS)
  return d
}

/**
 * Load the org's TLS material, generating a fresh throwaway CA + server cert
 * on first use. Everything lives under <org-dir>/tls/ so a backup captures it.
 * Self-signed is the right call here: public CAs won't issue for LAN IPs, and
 * the client pins this CA on first contact (TOFU).
 */
export async function ensureTls(orgDir: string, hosts: string[]): Promise<TlsMaterial> {
  const tlsDir = path.join(orgDir, 'tls')
  const caFile = path.join(tlsDir, 'ca.pem')
  const certFile = path.join(tlsDir, 'server.crt')
  const keyFile = path.join(tlsDir, 'server.key')

  try {
    const [caPem, certPem, keyPem] = await Promise.all([
      readFile(caFile, 'utf8'),
      readFile(certFile, 'utf8'),
      readFile(keyFile, 'utf8')
    ])
    return { caPem, certPem, keyPem, fingerprint: fingerprintPem(caPem), tlsDir }
  } catch {
    /* first run — generate below */
  }

  const ca = await selfsigned.generate([{ name: 'commonName', value: CA_CN }], {
    keySize: 2048,
    notAfterDate: notAfterDate(),
    algorithm: 'sha256',
    extensions: [{ name: 'basicConstraints', cA: true }]
  })
  const altNames = sanEntries(hosts)
  const server = await selfsigned.generate([{ name: 'commonName', value: SERVER_CN }], {
    keySize: 2048,
    notAfterDate: notAfterDate(),
    algorithm: 'sha256',
    ca: { key: ca.private, cert: ca.cert },
    extensions: [{ name: 'subjectAltName', altNames }]
  })

  await mkdir(tlsDir, { recursive: true })
  await writeFile(caFile, ca.cert)
  await writeFile(certFile, server.cert)
  await writeFile(keyFile, server.private)

  return {
    caPem: ca.cert,
    certPem: server.cert,
    keyPem: server.private,
    fingerprint: fingerprintPem(ca.cert),
    tlsDir
  }
}

type SanEntry = { type: 1 | 2 | 6 | 7; ip?: string; value?: string }

/** SAN entries: type 2 = DNS, type 7 = IP. Dedupes and drops unusable binds. */
function sanEntries(hosts: string[]): SanEntry[] {
  const seen = new Set<string>()
  const out: SanEntry[] = []
  for (const raw of hosts) {
    const h = String(raw).trim().toLowerCase()
    if (!h || h === '0.0.0.0' || seen.has(h)) continue
    seen.add(h)
    out.push(hostOrIp(h))
  }
  if (!seen.has('127.0.0.1')) out.push(hostOrIp('127.0.0.1'))
  if (!seen.has('localhost')) out.push(hostOrIp('localhost'))
  return out
}

function hostOrIp(h: string): SanEntry {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(h)
    ? { type: 7, ip: h }
    : { type: 2, value: h }
}
