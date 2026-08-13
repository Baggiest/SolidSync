import { makeClient } from '../cli'
import type { CommandOptions } from '../cli'

export async function runHealth(o: CommandOptions): Promise<number> {
  const client = await makeClient(o)
  try {
    const h = await client.health()
    console.log(JSON.stringify(h, null, 2))
    return h.ok ? 0 : 1
  } catch (err) {
    console.error(`health check failed: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
}