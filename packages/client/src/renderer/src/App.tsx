import { useEffect, useState } from 'react'
import { initStore, useClientState, doAction } from './lib/store'
import Onboarding from './components/Onboarding'
import { ConnectBanner } from './components/ConnectBanner'
import { TopBar, SideNav } from './components/TopBar'
import SectionContent from './components/SectionContent'
import PartDetail from './components/PartDetail'
import { Modal } from './components/Modal'
import { ServerSettingsModal } from './components/ServerSettingsModal'
import { findPart, findSection } from './lib/selectors'

export default function App() {
  const state = useClientState()
  const [projectId, setProjectId] = useState<string | null>(null)
  const [sectionId, setSectionId] = useState<string | null>(null)
  const [partId, setPartId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [toastKind, setToastKind] = useState<'error' | 'ok'>('error')
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [newSectionOpen, setNewSectionOpen] = useState(false)
  const [serverOpen, setServerOpen] = useState(false)
  const [addServerOpen, setAddServerOpen] = useState(false)

  useEffect(() => initStore(), [])

  // Keep selection pointing at real ids after org refreshes.
  useEffect(() => {
    const org = state.org
    if (!org) return
    let pId = projectId
    if (!pId || !org.projects.some((p) => p.id === pId)) {
      pId = org.projects[0]?.id ?? null
    }
    const project = org.projects.find((p) => p.id === pId)
    let sId = sectionId
    if (!sId || !project?.sections.some((s) => s.id === sId)) {
      sId = project?.sections[0]?.id ?? null
    }
    if (pId !== projectId) setProjectId(pId)
    if (sId !== sectionId) setSectionId(sId)
    if (partId) {
      const found = findPart(org, partId)
      if (!found) setPartId(null)
    }
  }, [state.org, projectId, sectionId])

  const show = (msg: string, kind: 'error' | 'ok' = 'error'): void => {
    setToastKind(kind)
    setToast(msg)
    window.setTimeout(() => setToast(null), 6000)
  }

  const run = async (p: Promise<unknown>): Promise<void> => {
    const err = await doAction(p)
    if (err) show(err)
  }

  if (!state.appConfig.configured) {
    return <Onboarding />
  }

  const sel = projectId && sectionId ? findSection(state.org, projectId, sectionId) : null
  const part = partId ? findPart(state.org, partId) : null

  return (
    <div className="flex h-full flex-col bg-zinc-900 text-zinc-200">
      <ConnectBanner onEditServer={() => setServerOpen(true)} />
      <TopBar
        onRefresh={() => void run(window.solidsync.refresh())}
        onOpenMirror={() => void window.solidsync.revealRoot()}
        onOpenServer={() => setServerOpen(true)}
        onSwitchHost={(id) => void run(window.solidsync.switchHost(id))}
        onAddServer={() => setAddServerOpen(true)}
      />

      <div className="flex min-h-0 flex-1">
        <SideNav
          selectedProjectId={projectId}
          selectedSectionId={sectionId}
          onSelectSection={(p, s) => {
            setProjectId(p)
            setSectionId(s)
            setPartId(null)
          }}
          onNewProject={() => setNewProjectOpen(true)}
          onNewSection={(pid) => {
            setProjectId(pid)
            setNewSectionOpen(true)
          }}
          onArchive={(pid) => {
            const name = state.org?.projects.find((p) => p.id === pid)?.name ?? ''
            void (async () => {
              const err = await doAction(window.solidsync.archiveProject(pid))
              if (err) show(err)
              else {
                show(`Archived "${name}"`, 'ok')
                setPartId(null)
              }
            })()
          }}
          onUnarchive={(pid) => {
            const name = state.org?.projects.find((p) => p.id === pid)?.name ?? ''
            void (async () => {
              const err = await doAction(window.solidsync.unarchiveProject(pid))
              if (err) show(err)
              else show(`Restored "${name}"`, 'ok')
            })()
          }}
        />

        <main className="flex min-w-0 flex-1 flex-col">
          {sel ? (
            <SectionContent
              project={sel.project}
              section={sel.section}
              selectedPartId={partId}
              syncState={state.syncState}
              onPickPart={(id) => setPartId((cur) => (cur === id ? null : id))}
              onError={(m) => show(m)}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-zinc-600">
              Pick a project and section, or start a project to get going.
            </div>
          )}
        </main>

        {part && sel && (
          <PartDetail
            part={part.part}
            org={state.org}
            onSetWork={(pid, s) => void run(window.solidsync.setWorkStatus(pid, s))}
            onSetHead={(pid, v) => void run(window.solidsync.setHead(pid, v))}
            onSetParent={(pid, parent) => void run(window.solidsync.setParent(pid, parent))}
            onSetName={(pid, name) => void run(window.solidsync.setPartName(pid, name))}
            onOpenVersion={(p, v) =>
              void run(
                window.solidsync.openVersion({
                  projectId: sel.project.id,
                  sectionId: sel.section.id,
                  partId: p.id,
                  versionId: v,
                  fileName: p.versions.find((x) => x.id === v)?.fileName ?? p.name
                })
              )
            }
            onRevealVersion={(p, v) =>
              void run(
                window.solidsync.revealVersion({
                  projectId: sel.project.id,
                  sectionId: sel.section.id,
                  partId: p.id,
                  versionId: v,
                  fileName: p.versions.find((x) => x.id === v)?.fileName ?? p.name
                })
              )
            }
            onDownloadVersion={(p, v) =>
              void run(
                window.solidsync.downloadVersion({
                  projectId: sel.project.id,
                  sectionId: sel.section.id,
                  partId: p.id,
                  versionId: v,
                  fileName: p.versions.find((x) => x.id === v)?.fileName ?? p.name
                })
              )
            }
            onCancelDownload={(versionId) => {
              void window.solidsync.cancelDownload(versionId)
            }}
            onClose={() => setPartId(null)}
          />
        )}
      </div>

      {toast && (
        <div
          className={`fixed bottom-4 right-4 z-50 max-w-sm rounded-md border px-3 py-2 text-sm shadow-xl ${
            toastKind === 'error'
              ? 'border-red-800 bg-red-950 text-red-200'
              : 'border-emerald-800 bg-emerald-950 text-emerald-200'
          }`}
        >
          {toast}
        </div>
      )}

      {newProjectOpen && (
        <NewThingModal
          title="New project"
          placeholder="e.g. Gearbox V2"
          onClose={() => setNewProjectOpen(false)}
          onSubmit={async (name) => {
            await run(window.solidsync.createProject(name))
            setNewProjectOpen(false)
            setToastKind('ok')
            setToast(`Project "${name}" created`)
            window.setTimeout(() => setToast(null), 4000)
          }}
        />
      )}
      {newSectionOpen && projectId && (
        <NewThingModal
          title="New section"
          placeholder="e.g. Drivetrain"
          onClose={() => setNewSectionOpen(false)}
          onSubmit={async (name) => {
            await run(window.solidsync.createSection(projectId, name))
            setNewSectionOpen(false)
          }}
        />
      )}

      {serverOpen && (
        <ServerSettingsModal
          onClose={() => setServerOpen(false)}
          onSaved={() => {
            setServerOpen(false)
            setProjectId(null)
            setSectionId(null)
            setPartId(null)
          }}
        />
      )}

      {addServerOpen && (
        <ServerSettingsModal
          empty
          onClose={() => setAddServerOpen(false)}
          onSaved={() => {
            setAddServerOpen(false)
            setProjectId(null)
            setSectionId(null)
            setPartId(null)
          }}
        />
      )}
    </div>
  )
}

function NewThingModal(props: {
  title: string
  placeholder: string
  onClose: () => void
  onSubmit: (name: string) => void
}) {
  const [name, setName] = useState('')
  return (
    <Modal title={props.title} onClose={props.onClose}>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && name.trim()) {
            props.onSubmit(name.trim())
          }
        }}
        className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-sky-600"
        placeholder={props.placeholder}
      />
      <div className="mt-3 flex justify-end gap-2">
        <button
          onClick={props.onClose}
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
        >
          Cancel
        </button>
        <button
          disabled={!name.trim()}
          onClick={() => props.onSubmit(name.trim())}
          className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-40"
        >
          Create
        </button>
      </div>
    </Modal>
  )
}