import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fetch as undiciFetch, Agent } from 'undici'
import { OrgStore } from '../src/store'
import { createApp } from '../src/app'
import { startHttps } from '../src/http'
import { ensureTls, fingerprintPem } from '../src/tls'
import { ServerClient } from '../src/http-client'

let tmp: string
let store: OrgStore
let server: { close: () => Promise<void>; port: number; host: string }
let caPem: string

beforeAll(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'solidsync-tls-'))
  store = await OrgStore.open(tmp, 'TLS Shop')
  const tls = await ensureTls(tmp, ['127.0.0.1', 'localhost'])
  caPem = tls.caPem
  server = await startHttps(createApp(store, { caPem: tls.caPem }), 0, '127.0.0.1', {
    key: tls.keyPem,
    cert: tls.certPem
  })
})

afterAll(async () => {
  await server.close()
  await store.close()
  await rm(tmp, { recursive: true, force: true })
})

describe('HTTPS', () => {
  it('serves the org over TLS with a trusted CA', async () => {
    const api = new ServerClient(`https://127.0.0.1:${server.port}`, 'tester', caPem)
    const h = await api.health()
    expect(h.orgName).toBe('TLS Shop')

    const projectId = await api.createProject('Secure')
    expect(projectId).toMatch(/^p[0-9a-f]{6}$/)
  })

  it('serves the CA at /tls/ca.pem for TOFU bootstrap', async () => {
    const agent = new Agent({ connect: { ca: [caPem] } })
    const res = await undiciFetch(`https://127.0.0.1:${server.port}/tls/ca.pem`, { dispatcher: agent })
    expect(res.ok).toBe(true)
    const pem = await res.text()
    expect(pem).toContain('BEGIN CERTIFICATE')
    expect(fingerprintPem(pem)).toBeTruthy()
    agent.close()
  })
})
