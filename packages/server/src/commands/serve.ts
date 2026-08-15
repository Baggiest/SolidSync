import { mkdir } from 'node:fs/promises'
import { OrgStore } from '../store'
import { createApp } from '../app'
import { startHttp, startHttps, lanIPs, type ServerHandle } from '../http'
import { ensureTls, type TlsMaterial } from '../tls'
import type { CommandOptions } from '../cli'

export async function runServe(o: CommandOptions): Promise<number> {
  await mkdir(o.dir, { recursive: true })
  const store = await OrgStore.open(o.dir, o.name, o.hostname)

  const hosts = tlsHosts(o.host)
  const tls: TlsMaterial | null = o.tls ? await ensureTls(o.dir, hosts) : null
  const app = createApp(store, tls ? { caPem: tls.caPem } : {})

  const handles: ServerHandle[] = []
  const httpHandle = await startHttp(app, o.port, o.host)
  handles.push(httpHandle)
  let tlsHandle: ServerHandle | null = null
  if (tls) {
    tlsHandle = await startHttps(app, o.tlsPort, o.host, { key: tls.keyPem, cert: tls.certPem })
    handles.push(tlsHandle)
  }

  const ips = lanIPs()
  console.log(`SolidSync server "${store.getHostName()}" (org "${store.getOrgName()}", rev ${store.getRev()})`)
  console.log(`  org data : ${o.dir}`)
  console.log(`  listening: http://${httpHandle.host}:${httpHandle.port}`)
  if (tlsHandle) console.log(`             https://${tlsHandle.host}:${tlsHandle.port}`)
  console.log(`  tell everyone: http://${ips[0] ?? '127.0.0.1'}:${httpHandle.port}`)
  if (tls) {
    console.log(`  TLS (recommended): https://${ips[0] ?? '127.0.0.1'}:${tlsHandle!.port}`)
    console.log(`  TLS CA: ${tls.tlsDir}/ca.pem  (clients show this fingerprint on first connect)`)
    console.log(`  CA fingerprint: ${tls.fingerprint}`)
  }
  console.log('  press Ctrl+C to stop')

  const shutdown = async (): Promise<void> => {
    console.log('\nshutting down…')
    await Promise.all(handles.map((h) => h.close()))
    await store.close()
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown())
  process.on('SIGTERM', () => void shutdown())

  await new Promise<void>(() => {
    /* keep the process alive until a signal arrives */
  })
  return 0
}

function tlsHosts(host: string): string[] {
  return [host, ...lanIPs(), '127.0.0.1', 'localhost']
}
