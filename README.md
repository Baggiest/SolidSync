# SolidGit

Shop-floor part sync tool. An advanced file explorer for mechanical engineers
that replaces manually-dated shared folders with version history, a single
source of truth for "which file is current," and basic collaboration signals.

No git required to use it. No login. No PDM seat.

```
ORG  →  PROJECTS  →  SECTIONS  →  PARTS
```

- **Org** — one server, one hosted endpoint. A single install.
- **Project** — a folder-equivalent, maps to one thing being built.
- **Section** — a grouping inside a project (a subsystem area). Parts live here.
- **Part** — a single file with a 6-digit ID, two independent statuses, a head
  version, and full history.

## What it does

- **Throw a file in** — drag a file into a section. It becomes a part with a
  6-digit ID (derived from the file's hash), its own head version, and full
  history. Optionally mark it as a subpart of another part; skip with one click.
- **Version history** — every submission is a new entry, oldest to newest.
  Repoint **Head** ("current version") at any point with a single click.
- **Two statuses, kept separate** — a machine-level **sync status** (Current /
  Syncing / Out of sync / Offline, set by the program) and a people-level
  **work status** (Red = don't touch, Yellow = ask first, Green = ready).
  Both show directly in the section listing. A part can be perfectly synced but
  flagged red (owner mid-change), or out of sync but green (network hiccup).
- **Start my own copy** — an individual can make an independent working copy of
  a whole project to develop on their own. No merging exists anywhere on
  purpose.
- **Always-visible connection bar** — server IP, port, and a giant red
  disconnected banner, so a dropped connection is noticed from across the room.

## Concepts

**Versioning, not a VCS.** Parts stay linear — there is no merge UI or engine,
no part-level branching, and no assembly-reference resolution. Two people can
still submit divergent versions of the same part; that's a coordination gap,
not a technical conflict. The work status (red/yellow) is the social
prevention; the sync status makes a stale local copy obvious before someone
saves blind.

**Vocabulary.** The UI deliberately avoids VCS jargon — no commit/push/pull/
merge/clone/checkout. The product says *throw in*, *save a version*, *set as
head*, *sync*, *out of sync / current*, *start my own copy*.

## Running it

First run shows a one-time setup: enter your name, choose **Host the org**
(run the shop server on this machine) or **Join an org** (point at a teammate's
IP and port). No account, no password.

Requires:

- Node.js 20+
- git on the machine that **hosts** the org (the version-storage engine)

```bash
npm install        # if the Electron binary wasn't downloaded, run:
node node_modules/electron/install.js
```

### Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Run in development (hot reload) |
| `npm run build` | Compile main / preload / renderer |
| `npm start` | Preview a production build |
| `npm test` | Run the vitest suite |
| `npm run typecheck` | TypeScript checks (node + web) |
| `npm run build:win` | Build Windows installer (NSIS + portable) |
| `npm run pack:win` | Build an unpacked Windows folder |

Default port is `3020`. Server binds `0.0.0.0` so teammates can reach it over
the LAN; the top bar shows the reachable address.

## Where data lives

Everything is under the app's user-data folder (e.g. `%APPDATA%/SolidGit` on
Windows).

```
userData/
├── config.json          # this machine's setup (name, mode, IP, port)
├── org/                 # host-mode org
│   ├── solidgit.db      # metadata: projects, sections, parts, versions, statuses
│   └── repos/<projectId>/   # one git repo per project holding the file bytes
└── mirror/              # client-mode local copies, one git repo per project
```

- Metadata is a single SQLite file (`sql.js`) — trivially backed up by copying
  it; the org is the whole `org/` folder.
- File bytes are committed into per-project git repos, so every version is
  recoverable from history.
- Each client keeps its own local mirror (backed by `isomorphic-git`) so
  browsing works offline and reconnects reconcile on the next poll.

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│  Electron app (GUI is display + requests only)             │
│  ┌──────────────┐    IPC     ┌───────────────────────────┐ │
│  │  Renderer    │ ─────────► │  Main                     │ │
│  │  (React)     │            │  ├─ SyncService (client)  │ │
│  └──────────────┘            │  │    polls /health,      │ │
│                              │  │    reconciles mirror   │ │
│                              │  └───┬────────────────────┘ │
└──────────────────────────────┼──────┼─────────────────────┘
                    host mode  │      │ client mode
                    0.0.0.0    ▼      ▼ (http)
                       ┌──────────────────────────┐
                       │  Express REST server      │
                       │  ├─ sql.js (SQLite)       │
                       │  └─ git binary (repos)    │
                       └──────────────────────────┘
```

- **The server is the single source of truth.** The GUI never decides — it
  reflects and requests, the server answers.
- Plain JSON over HTTP; no websockets. Clients poll `/api/health` every few
  seconds and refetch the org snapshot when the revision number moves.
- On the server side the engine is the real git binary (init/add/commit/log/
  show) via `child_process` — reliable on the host, no CLI output to parse.
- On the client side the mirror is embedded `isomorphic-git`, so no external
  git install is needed on shop PCs.

## Tech stack

Electron · React 19 · TypeScript · Vite (`electron-vite`) · Tailwind CSS ·
Express 5 · sql.js (SQLite) · isomorphic-git · Vitest

## Non-goals (deliberate)

- No merge UI or merge engine, at any level.
- No complex assembly/reference resolution — cross-part references stay the
  user's responsibility, as they are today.
- No login or auth screen.
- No cloud hosting requirement — self-hosted on commodity hardware.
- No git terminology anywhere in the user-facing product.
