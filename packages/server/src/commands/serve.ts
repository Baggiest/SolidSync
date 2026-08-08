import { mkdir } from 'node:fs/promises'
import { OrgStore } from '../store'
import { createApp } from '../app'
import { startHttp, lanIPs } from '../http'
import type { CommandOptions } from '../cli'

export async function runServe(o: CommandOptions): Promise<number> {
  await mkdir(o.dir, { recursive: true })
  const store = await OrgStore.open(o.dir, o.name)
  const server = await startHttp(createApp(store), o.port, o.host)

  const ips = lanIPs()
  console.log(`SolidSync server "${store.getOrgName()}" (rev ${store.getRev()})`)
  console.log(`  org data : ${o.dir}`)
  console.log(`  listening: http://${server.host}:${server.port}`)
  console.log(`  tell everyone: http://${ips[0] ?? '127.0.0.1'}:${server.port}`)
  console.log('  press Ctrl+C to stop')

  const shutdown = async (): Promise<void> => {
    console.log('\nshutting down…')
    await server.close()
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