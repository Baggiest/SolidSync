import { ServerClient } from '../http-client'
import type { CommandOptions } from '../cli'

export async function runHealth(o: CommandOptions): Promise<number> {
  const client = new ServerClient(o.url, o.user)
  try {
    const h = await client.health()
    console.log(JSON.stringify(h, null, 2))
    return h.ok ? 0 : 1
  } catch (err) {
    console.error(`health check failed: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
}