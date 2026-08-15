import { useSyncExternalStore } from 'react'
import type { ClientState, DownloadProgress, UploadProgress } from '@solidsync/shared'

export const EMPTY_STATE: ClientState = {
  appConfig: { configured: false, name: '', serverIp: '', port: 1, useTls: false },
  connection: 'connecting',
  syncState: 'out-of-sync',
  org: null,
  serverRev: null,
  error: null,
  health: null,
  mirrorRoot: null,
  downloaded: []
}

let state: ClientState = EMPTY_STATE
const listeners = new Set<() => void>()

export function getClientState(): ClientState {
  return state
}

export function setClientState(next: ClientState): void {
  state = next
  for (const fn of listeners) fn()
}

export function subscribeClientState(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function useClientState(): ClientState {
  return useSyncExternalStore(subscribeClientState, getClientState)
}

let upload: UploadProgress | null = null
const uploadListeners = new Set<() => void>()

export function getUploadProgress(): UploadProgress | null {
  return upload
}

function setUploadProgress(p: UploadProgress): void {
  upload = p
  for (const fn of uploadListeners) fn()
}

export function useUploadProgress(): UploadProgress | null {
  return useSyncExternalStore(
    (cb) => {
      uploadListeners.add(cb)
      return () => {
        uploadListeners.delete(cb)
      }
    },
    getUploadProgress
  )
}

// ---- in-flight downloads (per version) -------------------------------------

let downloads: Record<string, DownloadProgress> = {}
const downloadListeners = new Set<() => void>()

export function getDownloads(): Record<string, DownloadProgress> {
  return downloads
}

function setDownloads(next: Record<string, DownloadProgress>): void {
  downloads = next
  for (const fn of downloadListeners) fn()
}

export function useDownloads(): Record<string, DownloadProgress> {
  return useSyncExternalStore(
    (cb) => {
      downloadListeners.add(cb)
      return () => {
        downloadListeners.delete(cb)
      }
    },
    getDownloads
  )
}

/** Remove an in-flight download entry (after it completes or is cancelled). */
export function clearDownload(versionId: string): void {
  if (!downloads[versionId]) return
  const next = { ...downloads }
  delete next[versionId]
  setDownloads(next)
}

/** Run a download; clears the in-flight entry on settle. Returns an error or null. */
export async function downloadVersionNow(opts: {
  projectId: string
  sectionId: string
  partId: string
  versionId: string
  fileName: string
}): Promise<string | null> {
  const err = await doAction(window.solidsync.downloadVersion(opts))
  clearDownload(opts.versionId)
  return err
}

/** Ask the main process to abort an in-flight download (quiet — no toast). */
export function cancelDownload(versionId: string): void {
  void window.solidsync.cancelDownload(versionId)
}

/** Wire the store to the preload bridge. Returns an unsubscribe fn. */
export function initStore(): () => void {
  window.solidsync.getState().then(setClientState).catch(() => undefined)
  const offState = window.solidsync.subscribe(setClientState)
  const offUpload = window.solidsync.onUploadProgress(setUploadProgress)
  const offDownload = window.solidsync.onDownloadProgress((p) => {
    if (p.done) {
      clearDownload(p.versionId)
      return
    }
    setDownloads({ ...getDownloads(), [p.versionId]: p })
  })
  return () => {
    offState()
    offUpload()
    offDownload()
  }
}

/** Run an action; returns an error message or null. */
export async function doAction(p: Promise<unknown>): Promise<string | null> {
  try {
    await p
    return null
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}