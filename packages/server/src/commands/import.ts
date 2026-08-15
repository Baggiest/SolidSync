import path from 'node:path'
import { existsSync } from 'node:fs'
import { makeClient } from '../cli'
import type { CommandOptions } from '../cli'

export async function runImport(o: CommandOptions, filePath?: string): Promise<number> {
  if (!filePath) {
    console.error('usage: solidsync-server import FILE [--project NAME] [--section NAME] [--url URL]')
    return 1
  }
  const abs = path.resolve(filePath)
  if (!existsSync(abs)) {
    console.error(`file not found: ${abs}`)
    return 1
  }
  const client = await makeClient(o)

  const org = await client.getOrg()
  let project = org.projects.find((p) => p.name === o.project)
  if (!project && o.project) {
    const projectId = await client.createProject(o.project)
    project = { id: projectId, name: o.project, archived: false, sections: [] }
  } else if (!project) {
    project = org.projects[0]
    if (!project) {
      const projectId = await client.createProject('Shop')
      project = { id: projectId, name: 'Shop', archived: false, sections: [] }
    }
  }
  let section = project.sections.find((s) => s.name === o.section)
  if (!section) {
    const sectionId = await client.createSection(project.id, o.section ?? 'Parts')
    section = { id: sectionId, name: o.section ?? 'Parts', parts: [] }
  }

  const res = await client.uploadNew({
    projectId: project.id,
    sectionId: section.id,
    filePath: abs
  })
  console.log(
    o.json
      ? JSON.stringify({ ok: true, partId: res.partId, versionId: res.versionId, project: project.name, section: section.name })
      : `Threw in ${path.basename(abs)} -> ${project.name}/${section.name} (part ${res.partId})`
  )
  return 0
}