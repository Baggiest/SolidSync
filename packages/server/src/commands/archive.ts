import { makeClient } from '../cli'
import type { CommandOptions } from '../cli'

async function projectIdByName(o: CommandOptions, name: string): Promise<string | null> {
  const client = await makeClient(o)
  const org = await client.getOrg()
  return org.projects.find((p) => p.name === name)?.id ?? null
}

export async function runArchive(o: CommandOptions, projectName?: string): Promise<number> {
  if (!projectName) {
    console.error('usage: solidsync-server archive PROJECTNAME [--url URL]')
    return 1
  }
  const projectId = await projectIdByName(o, projectName)
  if (!projectId) {
    console.error(`no project named "${projectName}"`)
    return 1
  }
  const client = await makeClient(o)
  await client.archiveProject(projectId)
  console.log(
    o.json ? JSON.stringify({ ok: true, archived: projectName }) : `Archived "${projectName}"`
  )
  return 0
}

export async function runUnarchive(o: CommandOptions, projectName?: string): Promise<number> {
  if (!projectName) {
    console.error('usage: solidsync-server unarchive PROJECTNAME [--url URL]')
    return 1
  }
  const projectId = await projectIdByName(o, projectName)
  if (!projectId) {
    console.error(`no project named "${projectName}"`)
    return 1
  }
  const client = await makeClient(o)
  await client.unarchiveProject(projectId)
  console.log(
    o.json ? JSON.stringify({ ok: true, restored: projectName }) : `Restored "${projectName}"`
  )
  return 0
}