import type { AppConfig, ClientState, UploadProgress, WorkStatus } from '@solidsync/shared'

declare global {
  interface Window {
    solidsync: {
      getState: () => Promise<ClientState>
      subscribe: (cb: (state: ClientState) => void) => () => void
      onUploadProgress: (cb: (p: UploadProgress) => void) => () => void
      saveOnboarding: (cfg: AppConfig) => Promise<unknown>
      tlsProbe: (o: { serverIp: string; port: number }) => Promise<{ ok: boolean; fingerprint?: string; error?: string }>
      tlsTrust: () => Promise<boolean>
      tlsClear: () => Promise<boolean>
      tlsStatus: () => Promise<{ trusted: boolean; fingerprint: string | null }>
      createProject: (name: string) => Promise<unknown>
      createSection: (projectId: string, name: string) => Promise<unknown>
      archiveProject: (projectId: string) => Promise<unknown>
      unarchiveProject: (projectId: string) => Promise<unknown>
      throwIn: (opts: { projectId: string; sectionId: string; filePath: string; parentId?: string | null }) => Promise<unknown>
      saveVersion: (opts: { projectId: string; partId: string; filePath: string }) => Promise<unknown>
      setHead: (partId: string, versionId: string) => Promise<unknown>
      setWorkStatus: (partId: string, status: WorkStatus) => Promise<unknown>
      setParent: (partId: string, parentId: string | null) => Promise<unknown>
      setPartName: (partId: string, name: string) => Promise<unknown>
      refresh: () => Promise<unknown>
      openVersion: (opts: { projectId: string; sectionId: string; partId: string; versionId: string; fileName: string }) => Promise<unknown>
      revealRoot: () => Promise<unknown>
      pickFile: () => Promise<string | null>
      getPathForFile: (file: File) => string
    }
  }
}

export {}