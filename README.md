# SolidSync
Origin: Working as the captain of University of Tehran Nacional Formula Student team our mechanical engineers used to sort and manage their parts manually using FOLDERS and directories like "/GearboxV2-21AUG" and there was no shared space or over the network solution, everything was being done like the stone age using USB's sometimes, and my first thought was there has got to be a selfhost offline FOSS solution for mechanical engineering projects like we have git for software, and they said no, and shit they were right.

SolidSync is a Local Shop-floor part sync tool that just works. you run it on a potato server you have lying around and it becomes a server, people on your team install the Client and. An advanced file explorer for mechanical engineers
that replaces manually-dated shared folders with version history, a single
source of truth for "which file is current," and basic collaboration signals.

Problems:
- Sanctions: Our team is in Iran and we are basically banned off every mainstream software solution. (I.E. Solidworks, Autodesk, etc.)
- "WHERES THE HEAD": Days of work went on a part that wasnt the latest version of the hardware, And rebasing doesn't really exist in hardware like it does for software, SolidSync is set to address this problem at every level, parts have a version history and you always see the HEAD as the default
- Part Status: some parts are incomplete and shouldn't be worked upon, you can upload your file and set a label to show the status of that part, wether it's ready, ask first or avoid
- PDM/PLM is too expensive 
- OnShape is cloud-based and vendor-locked goyware
SolidGit is kinda worse at everything they do, but you own everything, and it just works and it's FREE


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

### HTTPS (encrypted) connections

Public CAs won't issue certificates for LAN IPs, so SolidSync does its own
TOFU (trust on first use):

- Run the server with `--tls` to also serve HTTPS on `--tls-port` (default
  `3443`, or `$SOLIDSYNC_TLS_PORT`). On first run it generates a throwaway CA
  + server cert under `<org-dir>/tls/` and prints the CA fingerprint.
  Plain HTTP stays on the original port, so old clients keep working during a
  rollout.
- In the client, tick **Use HTTPS** and enter the HTTPS port. The first
  connection shows the server's fingerprint — compare it to the one printed on
  the server console, then **Trust & connect**. The CA is pinned in the app's
  user-data folder (`server-ca.pem`) and every later session verifies against
  it. "Forget server identity" in Server settings clears it (e.g. after a
  server reinstall).
- CLI commands talk HTTPS too: pass `--url https://host:port --ca PATH` (or
  set `$SOLIDSYNC_CA`) so `health` / `list` / `import` trust the server.

## Where data lives

Everything is under the app's user-data folder (e.g. `%APPDATA%/SolidSync` on
Windows).

```
userData/
├── config.json          # this machine's setup (name, mode, IP, port)
├── server-ca.pem        # pinned server CA (HTTPS trust, client mode)
├── org/                 # host-mode org
│   ├── solidsync.db      # metadata: projects, sections, parts, versions, statuses
│   ├── tls/              # generated CA + server cert (when serving with --tls)
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
                    0.0.0.0    ▼      ▼ (http/https)
                       ┌──────────────────────────┐
                       │  Express REST server      │
                       │  ├─ sql.js (SQLite)       │
                       │  └─ git binary (repos)    │
                       └──────────────────────────┘
```

- **The server is the single source of truth.** The GUI never decides — it
  reflects and requests, the server answers.
- Plain JSON over HTTP (or HTTPS with `--tls`); no websockets. Clients poll
  `/api/health` every few seconds and refetch the org snapshot when the
  revision number moves.
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
