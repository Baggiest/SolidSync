# SolidSync

<img src="public/solidsync-logo.png" alt="SolidSync logo" width="300" />

## Quick start

SolidSync is two pieces: one **server** on your shop network (it holds the org
and the files), and the **desktop client** your teammates install to use it.
No source code, no git, no account, no cloud.

### Part 1 — Run the server

One machine on your network runs the server. That machine needs **Node.js 20+**
and **git** installed; nothing else.

```bash
npm install -g solidsync
solidsync-server serve
```

That's it — the server prints the address your team should point at (e.g.
`http://192.168.1.50:3020`) and stays running until you press Ctrl+C. Hand that
address out to your team.

### Part 2 — Install the client

Everyone else just downloads the client for their machine from the
[releases page](https://github.com/baggiest/solidsync/releases) — no install
wizard, no account, no dependencies:

- **Windows** — download `SolidSync-<version>-x64.exe` and double-click to
  install, or grab the `-x64-portable.zip` and run it without installing.
- **Linux** — download `SolidSync-<version>-amd64.deb` and run
  `sudo apt install ./SolidSync-<version>-amd64.deb`.

On first launch the client asks for your name and the server address from
Part 1 (`http://<LAN-IP>:3020`), then you're in.

### How did we get here

 Working as the captain of University of Tehran Nacional Formula Student team our mechanical engineers used to sort and manage their parts manually using FOLDERS and directories like "/GearboxV2-21AUG" and there was no shared space or over the network solution, everything was being done like the stone age using USB's sometimes, and my first thought was there has got to be a selfhost offline FOSS solution for mechanical engineering projects like we have git for software, and they said no, and shit they were right.

### Le Problems this project is trying to solve

- Sanctions: Our team is in Iran and we are basically banned off every mainstream software solution. (I.E. Solidworks, Autodesk, etc.)
- "WHERES THE HEAD": Days of work went on a part that wasnt the latest version of the hardware, And rebasing doesn't really exist in hardware like it does for software, SolidSync is set to address this problem at every level, parts have a version history and you always see the HEAD as the default
- Part Status: some parts are incomplete and shouldn't be worked upon, you can upload your file and set a label to show the status of that part, wether it's ready, ask first or avoid
- PDM/PLM is too expensive too complex
- OnShape is cloud-based and vendor-locked goyware
SolidSync is kinda worse at everything they do, but you own everything, and it just works and it's FREE

### AI slop will take it from here

SolidSync is a Local Shop-floor part sync tool that just works. you run it on a potato server you have lying around and it becomes a server, people on your team install the Client and. An advanced file explorer for mechanical engineers
that replaces manually-dated shared folders with version history, a single
source of truth for "which file is current," and basic collaboration signals.

No git required to use it. No login. No PDM seat.

```
ORG  →  PROJECTS  →  SECTIONS  →  PARTS
```

- **Org** — one server, one hosted endpoint. A single install.
- **Project** — a folder-equivalent, maps to one thing being built.
- **Section** — a grouping inside a project (a subsystem area). Parts live here.
- **Part** — a single file with a 6-digit ID, three independent statuses, a head
  version, and full history.

## What it does

- **Throw a file in** — drag a file into a section. It becomes a part with a
  6-digit ID (derived from the file's hash), its own head version, and full
  history. Optionally mark it as a subpart of another part; skip with one click.
- **Version history** — every submission is a new entry, oldest to newest.
  Repoint **Head** ("current version") at any point with a single click.
- **Three statuses, kept separate** — a machine-level **sync status** (Current /
  Syncing / Out of sync / Offline, set by the program), a per-version
  **download status** (On drive / Downloading / Not on drive — whether this
  version's file is actually on this machine), and a people-level **work
  status** (Red = don't touch, Yellow = ask first, Green = ready). All three
  show directly in the section listing and are always visible at once: a part
  can be perfectly synced but flagged red (owner mid-change), out of sync but
  green (network hiccup), or fully synced but not on this drive yet.
- **Files pulled on demand, not mirrored eagerly** — the app-level sync only
  fetches the org *structure* (projects, sections, parts, versions). Each
  version's file is downloaded individually with a **Download** button that
  shows progress and a Cancel, and the download status is tracked per version.
  Once a file is on drive it opens / "shows in file browser" even while
  offline; a submitted version is immutable, so downloaded files never re-sync.
- **Strict mirror, no local authority** — the GUI shows exactly what's on the
  server and nothing else. Delete a project on the server and it disappears
  from every client's GUI and local mirror after the next sync. There is no
  duplicate / "start my own copy" action anywhere in the client.
- **Saved servers, one-click switching** — every server you connect to is
  remembered (with an optional friendly name). When more than one is saved, a
  dropdown in the top bar switches between them; a "+" button beside it opens
  a fresh "Add server" form to connect to another one.
- **Archive / restore projects** — move a finished project out of the active
  list into an **Archived** section in the sidebar with one click. Nothing is
  deleted: the project stays on the server, fully browsable and still present in
  every client's listing — any files already on a machine's drive stay there — and
  restores with a single click.
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
head*, *sync*, *out of sync / current*.

## Install the client

The client is a plain desktop app — no login, no account, no install fluff. It
runs on any PC on the shop floor and needs nothing but itself.

- **Windows** — the build produces an NSIS installer and a portable `.exe`
  (`npm run build:win` → `dist/SolidSync-<version>-x64.exe`). Drop the installer
  on a shared drive or your release page; teammates double-click and it's done.
  The portable `.exe` doesn't even need installing.
- **Linux** — `npm run build:linux` produces a `.deb`
  (`dist/SolidSync-<version>-amd64.deb`), installable with `sudo apt install ./SolidSync-0.2.0-amd64.deb`.
- **Other platforms / building it yourself** — clone the repo and build:

  ```bash
  npm install
  npm run build         # compile main / preload / renderer
  npm run build:win     # Windows installer + portable (run on a Windows box)
  npm run build:linux   # Linux .deb
  ```

**App icon.** Drop your `icon.png` (at least 512×512, transparent background) at
`packages/client/build/icon.png`. It's used for the packaged app icon, the
installer, the `.desktop` entry, and the in-app window icon. The repo ships a
placeholder — overwrite it before shipping.

On first run, enter your name and type the address your admin printed when
they started the server (`http://<LAN-IP>:3020`).

### Things you can do in the client

- **Browse the org** — projects in the sidebar, sections inside them, parts in
  a table. Archived projects live under an "Archived" entry in the sidebar.
- **Throw a file in** — drag a file onto a section (or use **Throw in**) to
  create a new part with a 6-digit ID, a head version, and full history.
  Dropping onto an existing part row saves a new version of that part instead.
- **Save a new version** — drag a newer file onto a part's row. Every save is
  a new entry, oldest to newest; repoint **Head** at any version.
- **Download / open / reveal** — version files are pulled on demand with the
  **Download** button (progress + cancel). Once downloaded: **Open** launches
  the file, **Show in file browser** reveals it, both work offline.
- **Work status** — flip a part between 🔴 Do not touch / 🟡 Ask first /
  🟢 Clear. Independent of sync and download status.
- **Parent/subpart** — mark a part as a subpart of another (or clear it) in
  the part detail panel; editable later.
- **Rename** — rename a part's display name without touching the file.
- **Multi-server** — add and switch between saved servers from the top bar;
  the server list persists across restarts.
- **Sync control** — a manual **Sync** button forces a refresh, and the top
  bar shows connection state (connected / connecting / disconnected).
- **Archive / restore** — archive a finished project with one click (nothing
  is deleted, files stay on drive), restore it from the sidebar.

## Host the server

One machine on the shop network runs the headless server — the org lives there,
clients just point at it. Needs **Node.js 20+** and **git** (the version-storage
engine) on that machine.

```bash
npm install -g solidsync
solidsync-server serve
```

That's it. It binds `0.0.0.0:3020` by default, prints the URL to hand out
(`http://<LAN-IP>:3020`), and stays in the foreground until Ctrl+C.

Run it in the background with `--daemon` — the server detaches, logs to
`<dir>/server.log` by default, and the command prints the pid + URL, then exits:

```bash
solidsync-server serve --daemon --name "Fab Shop"
# SolidSync server running in the background
#   pid      : 1234
#   log      : ~/.solidsync/server.log
#   tell everyone: http://192.168.1.50:3020
#   stop it  : solidsync-server stop   (or kill 1234)
```

Stop or restart it by name — no need to remember the pid:

```bash
solidsync-server stop                 # graceful stop (SIGTERM, waits up to 15s)
solidsync-server restart              # stop, then start again with the same options
```

`restart` replays the launch record the daemon wrote at startup, so it comes
back with the same port, name, and TLS settings even after a reboot. Set
`--log PATH` for a different log location, `--pidfile PATH` to move the pid
file.

Everything is optional; defaults work for most shops:

| Option | Env var | Default | Meaning |
|---|---|---|---|
| `--dir PATH` | `SOLIDSYNC_DIR` | `~/.solidsync` | where org data lives |
| `--port N` | `SOLIDSYNC_PORT` | `3020` | HTTP port |
| `--host IP` | `SOLIDSYNC_HOST` | `0.0.0.0` | bind address |
| `--name NAME` | `SOLIDSYNC_NAME` | `Shop` | org name shown in the UI |
| `--daemon` | `SOLIDSYNC_DAEMON` | off | run `serve` in the background |
| `--log PATH` | `SOLIDSYNC_LOG` | `<dir>/server.log` | log file for `--daemon` |
| `--pidfile PATH` | `SOLIDSYNC_PIDFILE` | `<dir>/server.pid` | pid file for `--daemon` (read by `stop`/`restart`) |

```bash
solidsync-server serve --port 3020 --name "Fab Shop"
```

- **HTTPS:** add `--tls` to also serve HTTPS on `--tls-port` (default `3443`).
  First run generates a throwaway CA + cert under `<dir>/tls/` and prints the CA
  fingerprint; clients verify against it on first connect. See the TLS section
  below.
- **Backups:** `solidsync-server backup` snapshots the whole org into one
  archive, or just copy the `--dir` folder.

### Server CLI command reference

Everything the GUI can do over HTTP, the CLI can do from a terminal — run
against a *running* server unless noted.

```bash
solidsync-server serve                     # run the server in the foreground
solidsync-server serve --daemon            # run it in the background (logs to <dir>/server.log)
solidsync-server stop                      # stop the background server
solidsync-server restart                   # stop, then start again with the same options
solidsync-server init                      # create/repair the org data folder
solidsync-server health                    # is the server up? prints JSON
solidsync-server list                      # print the whole org tree
solidsync-server list --json               # raw org snapshot, machine-readable
solidsync-server import step.step          # throw a file in (first project/section)
solidsync-server import step.step --project "Gearbox V2" --section Drivetrain
solidsync-server status 482913             # show a part's state (prefix ok)
solidsync-server status 482913 --set red   # stamp work status: red|yellow|green
solidsync-server branch "Gearbox V2" "Gearbox V2 Copy"   # admin-only project copy
solidsync-server archive "Gearbox V2"      # move out of the active list
solidsync-server unarchive "Gearbox V2"    # bring it back
solidsync-server backup                    # snapshot whole org to tar.gz
solidsync-server backup /srv/solidsync-backups/org-$(date +%F).tar.gz
solidsync-server version                   # print the server version
```

Point any command at a remote server with `--url http://<LAN-IP>:3020` (and
`--ca PATH` for HTTPS). The full reference lives in
[`packages/server/README.md`](packages/server/README.md); `solidsync-server
--help` prints the usage inline.

## Running it

First run shows a one-time setup: enter your name and point at the shop server
(IP and port). No account, no password. The client never hosts the org — it is
a mirror of whatever the server has (structure synced automatically, version
files pulled on demand). Every server you connect to is remembered for
one-click switching in the top bar.

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
| `npm run build:linux` | Build a Linux `.deb` |

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

The client stores only what it needs to talk to and mirror the server. The org
itself lives on the server machine.

```
Client machine — user-data folder (e.g. %APPDATA%/SolidSync on Windows):
├── config.json          # this machine's setup (name, active server, saved servers)
├── server-ca.pem        # pinned server CA (HTTPS trust)
└── mirror/<projectId>/  # local mirror of the server's projects, one git repo each

Server machine — SOLIDSYNC_DIR (default ~/.solidsync):
├── solidsync.db          # metadata: projects, sections, parts, versions, statuses
├── tls/                  # generated CA + server cert (when serving with --tls)
├── server.pid            # pid of the background server (when running with --daemon)
├── server.launch.json    # launch record used by `restart`
└── repos/<projectId>/    # one git repo per project holding the file bytes
```

- Metadata is a single SQLite file (`sql.js`) on the server — trivially backed
  up by copying it; the org is the whole server data folder.
- File bytes are committed into per-project git repos, so every version is
  recoverable from history.
- Each client keeps a local mirror (backed by `isomorphic-git`) of the org
  *structure* only — the sync layer fetches projects/sections/parts/versions
  and prunes anything that vanished from the server, so browsing stays current
  and deleted content disappears from the GUI on the next sync. Version *files*
  are pulled on demand via Download (progress + cancel) and tracked per version,
  so you only download what you actually open. Anything already on the drive
  opens and browses offline.

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
                               ▼ (http/https)
                        ┌──────────────────────────┐
                        │  Express REST server      │
                        │  ├─ sql.js (SQLite)       │
                        │  └─ git binary (repos)    │
                        └──────────────────────────┘
```

- **The server is the single source of truth.** The GUI never decides — it
  reflects and requests, the server answers. Anything deleted on the server
  disappears from every client's GUI and mirror on the next sync.
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
