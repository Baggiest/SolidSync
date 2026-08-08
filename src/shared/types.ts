// Shared types between main and renderer. Keep this file dependency-free.

export type WorkStatus = 'red' | 'yellow' | 'green'

// Machine-level sync relationship between the client's local mirror and the
// server. Set by the program, never by a person.
export type SyncState = 'synced' | 'syncing' | 'out-of-sync' | 'offline'

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
  sections: SectionInfo[]
}

export interface OrgSnapshot {
  orgName: string
  rev: number
  projects: ProjectInfo[]
}

export type AppMode = 'host' | 'client'

export interface AppConfig {
  configured: boolean
  mode: AppMode
  name: string
  serverIp: string
  port: number
}

export type ConnectionState = 'connecting' | 'online' | 'offline'

// Client mirror keeps one isomorphic-git repo per project; partId here is the
// version's owning part for path bookkeeping.
export interface MirrorFile {
  versionId: string
  relPath: string // relative path inside the project repo working tree
  size: number
  hash6: string
}

export interface ClientState {
  appConfig: AppConfig
  connection: ConnectionState
  syncState: SyncState
  org: OrgSnapshot | null
  serverRev: number | null // last rev seen from the server (null until first contact)
  error: string | null
  health: { orgName: string; rev: number; serverTime: string } | null
  // host mode: the address other machines should connect to; client mode: null
  hostAddress: string | null
  // client mode: the local mirror folder the user can browse
  mirrorRoot: string | null
}