export const DEFAULT_PORT = 3020

// Words the UI uses for version-control concepts (spec §8). Never let the words
// "commit", "push", "pull", "merge", "clone", "checkout" reach the UI.
export const VOCAB = {
  submit: 'Throw in',
  submitHint: 'Drop a file to throw it into the shop',
  saveVersion: 'Save a version',
  setHead: 'Set as head',
  current: 'Current',
  outOfSync: 'Out of sync',
  syncing: 'Syncing',
  synced: 'Current',
  offline: 'Offline'
} as const

export function clientTitle(sass: string): string {
  return sass
}