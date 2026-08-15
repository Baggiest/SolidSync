// Shared types between main and renderer. Keep this file dependency-free.

export type WorkStatus = 'red' | 'yellow' | 'green'

// Machine-level sync relationship between the client's local mirror and the
// server. Set by the program, never by a person.
export type SyncState = 'synced' | 'syncing' | 'out-of-sync' | 'offline'

// Whether one version's file exists on this machine's drive. Independent of
// SyncState: the app-level sync only fetches metadata; version files are
// pulled on demand. Set by the program, never by a person.
export type DownloadStatus = 'not-downloaded' | 'downloading' | 'downloaded' | 'failed'

export interface VersionInfo {
  id: string
  partId: string
  fileName: string
  hash6: string
  size: number
  submittedAt: string
  submittedBy: string
}

export interface PartInfo {
  id: string
  projectId: string
  sectionId: string
  name: string
  ext: string
  parentId: string | null
  workStatus: WorkStatus
  head: string | null
  versions: VersionInfo[]
  lastModified: string
  lastModifiedBy: string
}

export interface SectionInfo {
  id: string
  name: string
  parts: PartInfo[]
}

export interface ProjectInfo {
  id: string
  name: string
  archived: boolean
  sections: SectionInfo[]
}

export interface OrgSnapshot {
  orgName: string
  rev: number
  projects: ProjectInfo[]
}

export interface AppConfig {
  configured: boolean
  name: string
  serverIp: string
  port: number
  useTls: boolean
}

// A saved server the client can switch back to. `id` is the canonical
// scheme://ip:port key; `name` is an optional friendly label.
export interface HostPreset {
  id: string
  name: string
  serverIp: string
  port: number
  useTls: boolean
}

export type ConnectionState = 'connecting' | 'online' | 'offline'

export interface Health {
  ok: boolean
  orgName: string
  // The server's self-reported host name (set via `serve --hostname`, or a
  // random fallback). Optional so old servers don't break newer clients.
  hostName?: string
  rev: number
  serverTime: string
  version: string
}

// Client mirror keeps one isomorphic-git repo per project; partId here is the
// version's owning part for path bookkeeping.
export interface MirrorFile {
  versionId: string
  relPath: string // relative path inside the project repo working tree
  size: number
  hash6: string
}

// Progress of an in-flight file upload from a client to the server.
export interface UploadProgress {
  fileName: string
  sent: number
  total: number
  done: boolean
}

// Progress of an in-flight file download from the server to the client mirror.
export interface DownloadProgress {
  versionId: string
  fileName: string
  sent: number
  total: number
  // sent once the download settles (finished, cancelled, or failed) so the UI
  // can drop the in-flight entry.
  done: boolean
}

export interface ClientState {
  appConfig: AppConfig
  connection: ConnectionState
  syncState: SyncState
  org: OrgSnapshot | null
  serverRev: number | null // last rev seen from the server (null until first contact)
  error: string | null
  health: Health | null
  // the local mirror folder the user can browse
  mirrorRoot: string | null
  // version ids whose files exist on this machine's drive (per-part downloads)
  downloaded: string[]
  // saved servers the user can switch back to
  hosts: HostPreset[]
}