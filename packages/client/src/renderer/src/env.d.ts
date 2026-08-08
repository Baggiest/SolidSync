import type { AppConfig, ClientState, WorkStatus } from '@solidgit/shared'

declare global {
  interface Window {
    solidgit: {
      getState: () => Promise<ClientState>
      subscribe: (cb: (state: ClientState) => void) => () => void
      saveOnboarding: (cfg: AppConfig) => Promise<unknown>
      createProject: (name: string) => Promise<unknown>
      startMyCopy: (projectId: string) => Promise<unknown>
      createSection: (projectId: string, name: string) => Promise<unknown>
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