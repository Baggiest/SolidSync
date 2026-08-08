import { mkdir } from 'node:fs/promises'
import { OrgStore } from '../store'
import type { CommandOptions } from '../cli'

export async function runInit(o: CommandOptions): Promise<number> {
  await mkdir(o.dir, { recursive: true })
  const store = await OrgStore.open(o.dir, o.name)
  console.log(`Initialized org "${store.getOrgName()}" at ${o.dir}`)
  await store.close()
  return 0
}