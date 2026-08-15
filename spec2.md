# spec2.md — Split Server & Client (Local-Network Deployment)

## 1. Goal

Turn the single Electron app into two independently deployable artifacts for the
target topology: **one main server on a shop machine, and a bunch of GUI clients
connecting to it over the local network.**

- **Server** — headless, universal, CLI-driven. Runs on "a potato": a plain Node
  process (or a single bundled executable) + git. No GUI, no Electron. Can be
  run manually, as a service, or under a scheduler. Includes admin commands.
- **Client** — the existing Electron GUI, now strictly a *client*. Onboarding is
  just *name + server IP/port*. No embedded server mode.

## 2. Topology

```
                    ┌─────────────────────┐
   shop machine 1   │  solidsync-server    │   main org (source of truth)
   ("the potato")   │  node cli serve     │   sql.js DB + per-project git repos
                    │  0.0.0.0:3020       │
                    └─────────┬───────────┘
                              │ LAN (http, plain JSON)
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
   │ SolidSync GUI │ │ SolidSync GUI │ │ SolidSync GUI │  one per engineer
   │ (client)     │ │ (client)     │ │ (client)     │  strict mirror, offline-capable
   └──────────────┘ └──────────────┘ └──────────────┘
```

Everything the client can do over the wire, the CLI can also do — so the server
is scriptable and operable without opening the GUI. No login, same as before:
reach it by `IP:port`, identity comes from the `X-User` header.

## 3. Repository layout — npm-workspaces monorepo

```
solidsync0/
├── spec.md                 (product spec — updated as features land)
├── spec2.md                (this plan)
├── package.json            (workspaces: packages/*, root scripts)
├── vitest.config.ts        (root test runner)
└── packages/
    ├── shared/             @solidsync/shared
    │   └── src/            types.ts, constants.ts (VOCAB, DEFAULT_PORT)
    ├── server/             @solidsync/server   (headless; no Electron)
    │   ├── src/
    │   │   ├── cli.ts          entrypoint: `solidsync-server <cmd>`
    │   │   ├── commands/       serve, init, health, list, import, status, backup
    │   │   ├── store.ts        OrgStore (sql.js)   [moved]
    │   │   ├── git.ts          Repo wrapper        [moved]
    │   │   ├── app.ts          Express routes      [moved]
    │   │   ├── http.ts         startHttp / lanIPs  [moved]
    │   │   ├── http-client.ts  thin admin REST client (used by CLI + tests)
    │   │   ├── wasm.ts         robust sql.js wasm locator (bundled + source)
    │   │   └── lib/            queue.ts, hash.ts   [moved]
    │   ├── tests/              store.test.ts, api.test.ts  [moved]
    │   └── scripts/build.mjs   esbuild bundle → dist/cli.js + wasm copy
    └── client/             @solidsync/client   (Electron GUI only)
        ├── electron.vite.config.ts   [moved]
        ├── electron-builder.yml      [moved]
        └── src/
            ├── main/        index.ts, config.ts, session.ts  (client-only)
            ├── main/client/ api.ts, mirror.ts, sync.ts        [moved]
            ├── preload/     index.ts                          [moved]
            └── renderer/    React app (onboarding = name + IP:port)
```

## 4. Server CLI

### Commands

```
solidsync-server <command> [options]

  serve    Run the org server (default command)
             --dir <path>   data dir            (default ~/.solidsync)
             --port <n>     listen port         (default 3020)
             --host <ip>    bind address        (default 0.0.0.0)
             --name <org>   org name            (default "Shop")
             --hostname <name>  friendly server name shown in clients
                                (default a random fruit/animal name)
             --verbose      log each request
  init     Create/verify the org data dir + DB  (--dir, --name)
  health   --url http://ip:port   print health JSON
  list     --url ... --json       list projects/sections/parts
  import   --url ... --project <id> --file <path> [--section <id>]
           [--user <name>] [--parent <id>]     throw a file in
  status   --url ... --part <id> [--set red|yellow|green]  read/write work status
  archive  --url ... PROJECT   move a project into the Archived section
  unarchive --url ... PROJECT  bring an archived project back
  backup   --dir <path> --out <archive.zip>    zip DB + repos
  version  print version
```

All flags also settable via env: `SOLIDGIT_DIR`, `SOLIDGIT_PORT`,
`SOLIDGIT_HOST`, `SOLIDGIT_NAME`. Exit codes: 0 ok, 1 error, 2 usage.

### serve behavior
- Opens the org (`OrgStore.open`), starts the Express app on `host:port`.
- Prints the reachable address(es) for the team: `0.0.0.0:3020` plus the first
  LAN IP (e.g. `192.168.1.50:3020`).
- Host name (`--hostname` / `SOLIDSYNC_HOSTNAME`) is persisted in the org DB and
  reported on `/api/health` so clients label the server with it. Without a flag
  the server picks a stable random name from a small fruit/animal list. This is
  cosmetic identity only — never authoritative org data.
- Graceful shutdown on SIGINT/SIGTERM: close HTTP server, persist + close DB.
- No login, no auth — LAN trust model, unchanged from spec.

## 5. Resilience choices

- **Server survives without the GUI.** It is its own process/artifact; restarting
  or killing the GUI never touches the org.
- **Single-file executable.** The server is esbuild-bundled to
  `packages/server/dist/cli.js` (ESM, shebang). Ship it + git → runs on any
  Node 20+ machine without installing dev tooling. The sql.js `.wasm` is copied
  next to the bundle and located at runtime (bundled + source fallbacks).
- **`backup` command** zips the whole org dir (DB + git repos) — trivial
  off-machine backup of the "single source of truth."
- **Repeated `init`/`serve` is idempotent** — pointing at an existing dir just
  opens it.
- **CLI ↔ GUI parity** — anything the GUI can do over HTTP, the CLI can, so
  server-side maintenance doesn't require a display.
- **Client stays offline-capable** — local isomorphic-git mirror; the sync
  layer only fetches the org *structure* (projects/sections/parts/versions)
  and prunes anything that vanished from the server (e.g. a deleted project),
  so deleted content disappears from every client's GUI and mirror on the next
  sync. Version *files* are pulled on demand per version via a Download button
  (with progress + cancel), tracked by a per-version download status on the
  client. Once on drive, a file opens/browses even while offline; a submitted
  version is immutable, so downloaded files never re-sync.

## 6. Client changes (strip the host mode)

- `AppConfig` drops `mode`; `ClientState` drops `hostAddress`.
- Onboarding: name + server IP + port only. Default `127.0.0.1:3020`.
- Top bar: always shows `${serverIp}:${port}` and connection state; the
  "Hosting" badge and host-address logic are removed. When multiple servers
  have been saved, the top bar shows a dropdown to switch between them
  (hosts registry persisted in the client's `config.json`; each host can carry
  a friendly name). Saving server settings upserts the connection into that
  registry automatically; onboarding itself stays one-screen.
- `Session` becomes: `SyncService(config.name, mirrorRoot)` pointed at the
  server. `config.ts`, `index.ts`, `session.ts` simplified.
- The **"start my own copy" (duplicate) action is removed from the client** —
  the button, IPC, preload bridge, and API method are gone. The client has no
  way to copy a project; the server-side `/copy` endpoint and `branch` CLI
  command remain as admin-only operations.
- **Archive / restore projects.** Each project row gains an archive button; an
  **Archived** section in the sidebar lists archived projects with a restore
  button. The archived flag is server state (`projects.archived`, schema v3),
  read straight from the org snapshot — the client never decides what's
  archived. Archived projects stay in the snapshot (still browsable, files
  already on a client's drive stay on drive), they just move to a different
  sidebar section.
- All part/section/version/work-status actions go over HTTP to the server,
  exactly as today. Version file downloads stream over HTTP too (`downloadFile`
  in `api.ts`), with byte-count progress and an abort signal backing the
  Download / Cancel buttons; `ClientState` carries the set of version ids
  present on the local drive (`downloaded`).
- **Client auto-update** (About modal → Update button) checks the latest
  GitHub release via electron-updater and installs it in-app (download
  progress + restart-to-install). The server has no update button — it is
  updated by re-running the bundle, not from the GUI.

## 7. Shared package

`@solidsync/shared` holds the type contracts (`types.ts`) and UI vocabulary
(`constants.ts`) used by both sides. Kept dependency-free; bundled by each
artifact (devDependency so electron-vite inlines it, never externalized).

## 8. Build / scripts (root)

| Command | Purpose |
|---|---|
| `npm run dev` | run the Electron client |
| `npm run server` | run `solidsync-server serve` (dev, tsx) |
| `npm run build` | build all workspaces (shared, server bundle, client) |
| `npm run typecheck` | tsc across all workspaces |
| `npm test` | vitest (server tests at `packages/server/tests`) |
| `npm run build:win` | electron-vite build + electron-builder (client) |
| `npm run pack:win` | unpacked Windows folder (client) |
| `node packages/server/dist/cli.js …` | the production server binary |

## 9. Non-goals (unchanged)

No merge anywhere, no assembly resolution, no login, no cloud requirement,
no git vocabulary in the UI. The server needs git installed (it is the storage
engine); client machines never need git.

## 10. Out of scope for this pass

Auth/HTTPS, multi-org federation, Docker packaging (easy to add later —
the server is just a Node process). Client auto-update ships via GitHub
Releases (electron-updater) — see `RELEASE.md` for the exact upload recipe.
