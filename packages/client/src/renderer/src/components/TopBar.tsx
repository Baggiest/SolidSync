import { useState } from 'react'
import { useClientState } from '../lib/store'
import { IconChevron, IconFolder, IconPlus, IconRefresh, IconFolderOpen, IconCopy } from './icons'
import { VOCAB } from '@solidgit/shared'

export function TopBar(props: { onRefresh: () => void; onOpenMirror: () => void; onOpenServer: () => void }) {
  const state = useClientState()
  const { appConfig: cfg, connection, org } = state

  const addr = cfg.serverIp ? `${cfg.serverIp}:${cfg.port}` : '—'

  const connText =
    connection === 'online' ? 'Connected' : connection === 'connecting' ? 'Connecting…' : 'Disconnected'
  const dot =
    connection === 'online'
      ? 'bg-green-500'
      : connection === 'connecting'
        ? 'bg-yellow-400 animate-pulse'
        : 'bg-red-500'

  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-zinc-800 bg-zinc-950/90 px-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold tracking-tight text-zinc-100">SolidGit</span>
        {org && (
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] font-medium text-zinc-400">
            {org.orgName}
          </span>
        )}
      </div>

      <div className="mx-2 h-5 w-px bg-zinc-800" />

      <div className="flex items-center gap-1.5 text-xs text-zinc-400">
        <span className="font-medium uppercase tracking-wide text-zinc-500">Server</span>
        <button
          onClick={props.onOpenServer}
          className="rounded px-1.5 py-0.5 font-mono text-[12px] text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
          title="Edit server settings"
        >
          {addr}
        </button>
        <span className={`ml-1 inline-block h-2 w-2 rounded-full ${dot}`} />
        <span className={connection === 'online' ? 'text-emerald-400' : 'text-zinc-400'}>
          {connText}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <button
          onClick={props.onOpenMirror}
          className="inline-flex h-7 items-center gap-1.5 rounded border border-zinc-700 px-2 text-xs text-zinc-300 hover:bg-zinc-800"
          title="Show my local copy in Explorer"
        >
          <IconFolderOpen className="h-4 w-4" />
        </button>
        <button
          onClick={props.onRefresh}
          className="inline-flex h-7 items-center gap-1.5 rounded border border-zinc-700 px-2 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          <IconRefresh className="h-4 w-4" />
          Sync
        </button>
      </div>
    </header>
  )
}

export function SideNav(props: {
  selectedProjectId: string | null
  selectedSectionId: string | null
  onSelectSection: (projectId: string, sectionId: string) => void
  onNewProject: () => void
  onNewSection: (projectId: string) => void
  onStartMyCopy: (projectId: string) => void
}) {
  const { org } = useClientState()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-800/70 px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
          Projects
        </span>
        <button
          className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          onClick={props.onNewProject}
          title="New project"
        >
          <IconPlus className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {!org || org.projects.length === 0 ? (
          <div className="px-3 py-4 text-xs leading-5 text-zinc-500">
            No projects yet. Start one, then drop a file into a section to throw a part in.
          </div>
        ) : (
          org.projects.map((project) => {
            const open = collapsed[project.id] !== true
            const activeProject = props.selectedProjectId === project.id
            return (
              <div key={project.id}>
                <div
                  className={`group flex cursor-pointer items-center gap-1.5 px-2 py-1.5 text-sm ${
                    activeProject ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-300 hover:bg-zinc-800/60'
                  }`}
                  onClick={() => {
                    setCollapsed((c) => ({ ...c, [project.id]: open }))
                    const firstSection = project.sections[0]
                    if (firstSection) props.onSelectSection(project.id, firstSection.id)
                  }}
                >
                  <IconChevron className={`h-3.5 w-3.5 text-zinc-500 ${open ? 'rotate-90' : ''}`} />
                  <IconFolder className="h-4 w-4 text-zinc-400" />
                  <span className="flex-1 truncate">{project.name}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      props.onStartMyCopy(project.id)
                    }}
                    className="rounded p-0.5 text-zinc-500 opacity-0 hover:text-zinc-100 group-hover:opacity-100"
                    title={VOCAB.ownCopy}
                  >
                    <IconCopy className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      props.onNewSection(project.id)
                    }}
                    className="rounded p-0.5 text-zinc-500 opacity-0 hover:text-zinc-100 group-hover:opacity-100"
                    title="New section"
                  >
                    <IconPlus className="h-3.5 w-3.5" />
                  </button>
                </div>
                {open && (
                  <div className="ml-4 border-l border-zinc-800/70 pl-1">
                    {project.sections.map((section) => (
                      <div
                        key={section.id}
                        onClick={() => props.onSelectSection(project.id, section.id)}
                        className={`cursor-pointer rounded px-2 py-1 text-[13px] ${
                          props.selectedProjectId === project.id && props.selectedSectionId === section.id
                            ? 'bg-zinc-800 text-zinc-100'
                            : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
                        }`}
                      >
                        <span className="mr-1 text-zinc-600">▸</span>
                        {section.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </aside>
  )
}