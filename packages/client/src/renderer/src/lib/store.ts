import { useSyncExternalStore } from 'react'
import type { ClientState, UploadProgress } from '@solidsync/shared'

export const EMPTY_STATE: ClientState = {
  appConfig: { configured: false, name: '', serverIp: '', port: 1 },
  connection: 'connecting',
  syncState: 'out-of-sync',
  org: null,
  serverRev: null,
  error: null,
  health: null,
  mirrorRoot: null
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

/** Wire the store to the preload bridge. Returns an unsubscribe fn. */
export function initStore(): () => void {
  window.solidsync.getState().then(setClientState).catch(() => undefined)
  const offState = window.solidsync.subscribe(setClientState)
  const offUpload = window.solidsync.onUploadProgress(setUploadProgress)
  return () => {
    offState()
    offUpload()
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