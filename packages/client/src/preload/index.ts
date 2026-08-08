import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { AppConfig, ClientState, UploadProgress, WorkStatus } from '@solidsync/shared'

const api = {
  // state
  getState: (): Promise<ClientState> => ipcRenderer.invoke('app:getState'),
  subscribe: (cb: (state: ClientState) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, state: ClientState): void => cb(state)
    ipcRenderer.on('app:state', listener)
    return () => {
      ipcRenderer.removeListener('app:state', listener)
    }
  },

  // upload progress
  onUploadProgress: (cb: (p: UploadProgress) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, p: UploadProgress): void => cb(p)
    ipcRenderer.on('app:upload', listener)
    return () => {
      ipcRenderer.removeListener('app:upload', listener)
    }
  },

  // onboarding
  saveOnboarding: (cfg: AppConfig): Promise<void> => ipcRenderer.invoke('onboarding:save', cfg),

  // actions
  createProject: (name: string): Promise<unknown> => ipcRenderer.invoke('action:createProject', name),
  startMyCopy: (projectId: string): Promise<unknown> =>
    ipcRenderer.invoke('action:startMyCopy', { projectId }),
  createSection: (projectId: string, name: string): Promise<unknown> =>
    ipcRenderer.invoke('action:createSection', projectId, name),
  throwIn: (opts: { projectId: string; sectionId: string; filePath: string; parentId?: string | null }): Promise<unknown> =>
    ipcRenderer.invoke('action:throwIn', opts),
  saveVersion: (opts: { projectId: string; partId: string; filePath: string }): Promise<unknown> =>
    ipcRenderer.invoke('action:saveVersion', opts),
  setHead: (partId: string, versionId: string): Promise<unknown> =>
    ipcRenderer.invoke('action:setHead', partId, versionId),
  setWorkStatus: (partId: string, status: WorkStatus): Promise<unknown> =>
    ipcRenderer.invoke('action:setWorkStatus', partId, status),
  setParent: (partId: string, parentId: string | null): Promise<unknown> =>
    ipcRenderer.invoke('action:setParent', partId, parentId),
  setPartName: (partId: string, name: string): Promise<unknown> =>
    ipcRenderer.invoke('action:setPartName', partId, name),
  refresh: (): Promise<unknown> => ipcRenderer.invoke('action:refresh'),
  openVersion: (opts: { projectId: string; sectionId: string; partId: string; versionId: string; fileName: string }): Promise<unknown> =>
    ipcRenderer.invoke('action:openVersion', opts),
  revealRoot: (): Promise<unknown> => ipcRenderer.invoke('action:revealRoot'),
  pickFile: (): Promise<string | null> => ipcRenderer.invoke('action:pickFile'),

  /** Drag-and-drop: convert a renderer File to a real path in the main process. */
  getPathForFile: (file: File): string => webUtils.getPathForFile(file)
}

export type SolidSyncApi = typeof api

contextBridge.exposeInMainWorld('solidsync', api)