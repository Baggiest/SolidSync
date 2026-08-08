import { ServerClient } from '../http-client'
import type { CommandOptions } from '../cli'

export async function runBranch(o: CommandOptions, projectName?: string, newName?: string): Promise<number> {
  if (!projectName) {
    console.error('usage: solidsync-server branch PROJECTNAME [NEWNAME] [--url URL]')
    return 1
  }
  const client = new ServerClient(o.url, o.user)
  const org = await client.getOrg()
  const project = org.projects.find((p) => p.name === projectName)
  if (!project) {
    console.error(`no project named "${projectName}"`)
    return 1
  }
  const res = await client.branchProject({ projectId: project.id, name: newName })
  console.log(
    o.json
      ? JSON.stringify({ ok: true, projectId: res.projectId, name: res.name })
      : `Started "${res.name}" from "${project.name}" (new project ${res.projectId})`
  )
  return 0
}