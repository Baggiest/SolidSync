import type { OrgSnapshot, PartInfo, WorkStatus } from '@solidsync/shared'
import { makeClient } from '../cli'
import type { CommandOptions } from '../cli'

function findPart(org: OrgSnapshot, frag: string): PartInfo | null {
  for (const project of org.projects) {
    for (const section of project.sections) {
      for (const part of section.parts) {
        if (part.id === frag || part.id.startsWith(frag.toLowerCase())) return part
      }
    }
  }
  return null
}

export async function runStatus(o: CommandOptions, partId?: string): Promise<number> {
  if (!partId) {
    console.error('usage: solidsync-server status PARTID [--set green|yellow|red] [--url URL]')
    return 1
  }
  const client = await makeClient(o)
  const org = await client.getOrg()
  const part = findPart(org, partId)
  if (!part) {
    console.error(`no part matches "${partId}"`)
    return 1
  }

  if (o.set) {
    const status = o.set.toLowerCase() as WorkStatus
    if (status !== 'red' && status !== 'yellow' && status !== 'green') {
      console.error(`--set must be red|yellow|green, got "${o.set}"`)
      return 1
    }
    await client.setWorkStatus(part.id, status)
    console.log(`Set ${part.name} to ${status}`)
    return 0
  }

  const head = part.versions.find((v) => v.id === part.head)
  const out = {
    id: part.id,
    name: part.name + (part.ext ? '.' + part.ext : ''),
    workStatus: part.workStatus,
    head: head ? { id: head.id, fileName: head.fileName, submittedBy: head.submittedBy, submittedAt: head.submittedAt } : null,
    versions: part.versions.length,
    lastModified: part.lastModified,
    lastModifiedBy: part.lastModifiedBy
  }
  console.log(o.json ? JSON.stringify(out, null, 2) : out)
  return 0
}