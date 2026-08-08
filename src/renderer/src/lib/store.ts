import { useSyncExternalStore } from 'react'
import type { ClientState } from '../../../shared/types'

export const EMPTY_STATE: ClientState = {
  appConfig: { configured: false, mode: 'client', name: '', serverIp: '', port: 1 },
  connection: 'connecting',
  syncState: 'out-of-sync',
  org: null,
  serverRev: null,
  error: null,
  health: null,
  hostAddress: null,
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

/** Wire the store to the preload bridge. Returns an unsubscribe fn. */
export function initStore(): () => void {
  window.solidgit.getState().then(setClientState).catch(() => undefined)
  return window.solidgit.subscribe(setClientState)
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