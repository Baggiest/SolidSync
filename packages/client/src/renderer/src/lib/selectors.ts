import type { OrgSnapshot, PartInfo, ProjectInfo, SectionInfo } from '@solidgit/shared'

export function findSection(org: OrgSnapshot | null, projectId: string, sectionId: string): { project: ProjectInfo; section: SectionInfo } | null {
  if (!org) return null
  const project = org.projects.find((p) => p.id === projectId)
  if (!project) return null
  const section = project.sections.find((s) => s.id === sectionId)
  if (!section) return null
  return { project, section }
}

export function findPart(org: OrgSnapshot | null, partId: string): { project: ProjectInfo; section: SectionInfo; part: PartInfo } | null {
  if (!org) return null
  for (const project of org.projects) {
    for (const section of project.sections) {
      const part = section.parts.find((p) => p.id === partId)
      if (part) return { project, section, part }
    }
  }
  return null
}

export function partParentName(org: OrgSnapshot | null, partId: string): string | null {
  const found = findPart(org, partId)
  return found ? found.part.name : null
}