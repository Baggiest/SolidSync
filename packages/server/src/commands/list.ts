import { makeClient } from '../cli'
import type { CommandOptions } from '../cli'
import { WorkStatus } from '@solidsync/shared'

const STATUS_DOT: Record<WorkStatus, string> = {
  red: '●',
  yellow: '◐',
  green: '○'
}

export async function runList(o: CommandOptions): Promise<number> {
  const client = await makeClient(o)
  let org
  try {
    org = await client.getOrg()
  } catch (err) {
    console.error(`can't reach the server: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  }
  if (o.json) {
    console.log(JSON.stringify(org, null, 2))
    return 0
  }

  console.log(`ORGANIZATION ${org.orgName}  (rev ${org.rev})`)
  for (const project of org.projects) {
    console.log(`\n  ${project.name}`)
    for (const section of project.sections) {
      console.log(`    ${section.name}  (${section.parts.length} parts)`)
      for (const part of section.parts) {
        const head = part.head
        const headInfo = part.versions.find((v) => v.id === head)
        const stamp = headInfo ? `${headInfo.submittedBy} · ${headInfo.submittedAt}` : 'no versions'
        const by = part.lastModifiedBy ? `  by ${part.lastModifiedBy}` : ''
        console.log(
          `      ${STATUS_DOT[part.workStatus]} ${part.name}${part.ext ? '.' + part.ext : ''}  [${part.id}]  ${stamp}${by}`
        )
      }
    }
  }
  return 0
}