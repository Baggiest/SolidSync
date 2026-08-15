import { mkdir } from 'node:fs/promises'
import { OrgStore } from '../store'
import type { CommandOptions } from '../cli'

export async function runInit(o: CommandOptions): Promise<number> {
  await mkdir(o.dir, { recursive: true })
  const store = await OrgStore.open(o.dir, o.name, o.hostname)
  console.log(`Initialized org "${store.getOrgName()}" (host name "${store.getHostName()}") at ${o.dir}`)
  await store.close()
  return 0
}