import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { AppConfig, ClientState, DownloadProgress, UploadProgress, WorkStatus } from '@solidsync/shared'

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

  // download progress
  onDownloadProgress: (cb: (p: DownloadProgress) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, p: DownloadProgress): void => cb(p)
    ipcRenderer.on('app:download', listener)
    return () => {
      ipcRenderer.removeListener('app:download', listener)
    }
  },

  // onboarding
  saveOnboarding: (cfg: AppConfig): Promise<void> => ipcRenderer.invoke('onboarding:save', cfg),

  // TLS trust (TOFU)
  tlsProbe: (o: { serverIp: string; port: number }): Promise<{ ok: boolean; fingerprint?: string; error?: string }> =>
    ipcRenderer.invoke('tls:probe', o),
  tlsTrust: (): Promise<boolean> => ipcRenderer.invoke('tls:trust'),
  tlsClear: (): Promise<boolean> => ipcRenderer.invoke('tls:clear'),
  tlsStatus: (): Promise<{ trusted: boolean; fingerprint: string | null }> => ipcRenderer.invoke('tls:status'),

  // actions
  createProject: (name: string): Promise<unknown> => ipcRenderer.invoke('action:createProject', name),
  createSection: (projectId: string, name: string): Promise<unknown> =>
    ipcRenderer.invoke('action:createSection', projectId, name),
  archiveProject: (projectId: string): Promise<unknown> =>
    ipcRenderer.invoke('action:archiveProject', projectId),
  unarchiveProject: (projectId: string): Promise<unknown> =>
    ipcRenderer.invoke('action:unarchiveProject', projectId),
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
  revealVersion: (opts: { projectId: string; sectionId: string; partId: string; versionId: string; fileName: string }): Promise<unknown> =>
    ipcRenderer.invoke('action:revealVersion', opts),
  downloadVersion: (opts: { projectId: string; sectionId: string; partId: string; versionId: string; fileName: string }): Promise<unknown> =>
    ipcRenderer.invoke('action:downloadVersion', opts),
  cancelDownload: (versionId: string): Promise<unknown> => ipcRenderer.invoke('action:cancelDownload', versionId),
  revealRoot: (): Promise<unknown> => ipcRenderer.invoke('action:revealRoot'),
  pickFile: (): Promise<string | null> => ipcRenderer.invoke('action:pickFile'),

  /** Drag-and-drop: convert a renderer File to a real path in the main process. */
  getPathForFile: (file: File): string => webUtils.getPathForFile(file)
}

export type SolidSyncApi = typeof api

contextBridge.exposeInMainWorld('solidsync', api)