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
   shop machine 1   │  solidgit-server    │   main org (source of truth)
   ("the potato")   │  node cli serve     │   sql.js DB + per-project git repos
                    │  0.0.0.0:3020       │
                    └─────────┬───────────┘
                              │ LAN (http, plain JSON)
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
   │ SolidGit GUI │ │ SolidGit GUI │ │ SolidGit GUI │  one per engineer
   │ (client)     │ │ (client)     │ │ (client)     │  local mirror, offline-capable
   └──────────────┘ └──────────────┘ └──────────────┘
```

Everything the client can do over the wire, the CLI can also do — so the server
is scriptable and operable without opening the GUI. No login, same as before:
reach it by `IP:port`, identity comes from the `X-User` header.

## 3. Repository layout — npm-workspaces monorepo

```
solidgit0/
├── spec.md                 (original product spec — unchanged)
├── spec2.md                (this plan)
├── package.json            (workspaces: packages/*, root scripts)
├── vitest.config.ts        (root test runner)
└── packages/
    ├── shared/             @solidgit/shared
    │   └── src/            types.ts, constants.ts (VOCAB, DEFAULT_PORT)
    ├── server/             @solidgit/server   (headless; no Electron)
    │   ├── src/
    │   │   ├── cli.ts          entrypoint: `solidgit-server <cmd>`
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
    └── client/             @solidgit/client   (Electron GUI only)
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
solidgit-server <command> [options]

  serve    Run the org server (default command)
             --dir <path>   data dir            (default ~/.solidgit)
             --port <n>     listen port         (default 3020)
             --host <ip>    bind address        (default 0.0.0.0)
             --name <org>   org name            (default "Shop")
             --verbose      log each request
  init     Create/verify the org data dir + DB  (--dir, --name)
  health   --url http://ip:port   print health JSON
  list     --url ... --json       list projects/sections/parts
  import   --url ... --project <id> --file <path> [--section <id>]
           [--user <name>] [--parent <id>]     throw a file in
  status   --url ... --part <id> [--set red|yellow|green]  read/write work status
  backup   --dir <path> --out <archive.zip>    zip DB + repos
  version  print version
```

All flags also settable via env: `SOLIDGIT_DIR`, `SOLIDGIT_PORT`,
`SOLIDGIT_HOST`, `SOLIDGIT_NAME`. Exit codes: 0 ok, 1 error, 2 usage.

### serve behavior
- Opens the org (`OrgStore.open`), starts the Express app on `host:port`.
- Prints the reachable address(es) for the team: `0.0.0.0:3020` plus the first
  LAN IP (e.g. `192.168.1.50:3020`).
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
- **Client stays offline-capable** — local isomorphic-git mirror, reconcile on
  reconnect (existing SyncService behavior, unchanged).

## 6. Client changes (strip the host mode)

- `AppConfig` drops `mode`; `ClientState` drops `hostAddress`.
- Onboarding: name + server IP + port only. Default `127.0.0.1:3020`.
- Top bar: always shows `${serverIp}:${port}` and connection state; the
  "Hosting" badge and host-address logic are removed.
- `Session` becomes: `SyncService(config.name, mirrorRoot)` pointed at the
  server. `config.ts`, `index.ts`, `session.ts` simplified.
- All part/section/version/work-status/branch actions go over HTTP to the
  server, exactly as today.

## 7. Shared package

`@solidgit/shared` holds the type contracts (`types.ts`) and UI vocabulary
(`constants.ts`) used by both sides. Kept dependency-free; bundled by each
artifact (devDependency so electron-vite inlines it, never externalized).

## 8. Build / scripts (root)

| Command | Purpose |
|---|---|
| `npm run dev` | run the Electron client |
| `npm run server` | run `solidgit-server serve` (dev, tsx) |
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
the server is just a Node process), auto-update.
