# AGENT.md

## Project overview

SolidSync is a self-hosted, offline-first part/file manager for mechanical
engineering teams — an "advanced file explorer," explicitly not a VCS in
disguise. One headless server holds the org (the single source of truth,
using git as the storage engine underneath); each engineer runs an Electron
GUI client that mirrors the server over the LAN. No login, no cloud
requirement, no PDM seat.

Data hierarchy: `Org → Project → Section → Part`. A Part is a single CAD
file with a 6-digit ID (derived from its hash), a linear version history,
a Head pointer (current version), and three independent statuses:

- **Sync status** — set by the program: is this local copy of the org
  structure current with the server? (Synced / Syncing / Out of sync /
  Offline)
- **Download status** — set by the program (via the user's Download button):
  is this version's file on this machine's drive? (On drive / Downloading /
  Not on drive). App-level sync only fetches metadata; version files are
  pulled per version on demand, with progress + cancel. A submitted version is
  immutable, so downloaded files never re-sync.
- **Work status** — set by the person: is this part safe to touch right
  now? (🔴 Red = don't touch, 🟡 Yellow = ask first, 🟢 Green = ready)

Full product rationale lives in `spec.md`. The server/client split and
monorepo layout are described in `spec2.md`. Release steps are in
`RELEASE.md`. Read all three before making non-trivial changes — this file
summarizes the parts that should shape *how* you work, not the full spec.

## Repo layout

```
packages/
  shared/    @solidsync/shared — types + UI vocabulary constants, no deps
  server/    headless server — CLI, Express API, sql.js store, real git binary
  client/    Electron GUI — client-only, embeds isomorphic-git for its mirror
```

`shared` is consumed by both `server` and `client` and must stay
dependency-free. `server` shells out to the real `git` binary (it only runs
on one machine you control, so no output-parsing risk). `client` embeds
`isomorphic-git` instead (no external git install needed on shop-floor
PCs). This asymmetry is intentional — don't "fix" it into consistency.

## Dev environment / setup commands

- Install deps: `npm install`
- Run the Electron client (hot reload): `npm run dev`
- Run the server in dev mode: `npm run server`
- Build the client: `npm run build`
- Build the server bundle: `npm run build:server`
- Type-check everything: `npm run typecheck`
- Run the full test suite: `npm test`
- Bump the version everywhere: `npm run bump -- X.Y.Z --tag`

Node 20+ is required. The server also needs `git` installed on the host
machine — the client does not.

Before treating any task as finished, run `npm run typecheck && npm test`
and confirm both are clean. See `RELEASE.md` for the full packaging/release
flow when a change is meant to ship.

## Code style

- TypeScript throughout; keep `typecheck` clean, don't introduce `any` to
  silence an error.
- Follow the existing formatting and naming conventions already in the file
  you're editing — this repo doesn't enforce a separate style guide beyond
  what the code demonstrates.
- Keep `shared` free of runtime dependencies; it's meant to be trivially
  bundled into both `server` (esbuild) and `client` (electron-vite).
- Server-side git operations go through the real git binary via
  `child_process`. Client-side mirror operations go through
  `isomorphic-git`. Don't mix the two.

### UI vocabulary — this is a hard constraint, not a style preference

The product deliberately hides VCS jargon from users, because the target
users are non-programmers who should never feel like they're learning git.

**Never use in any user-facing string** (button labels, toasts, tooltips,
onboarding copy, error messages): commit, push, pull, merge, branch (as a
verb aimed at the user — describing the *capability* in docs is fine, but
no button should say "Branch"), clone, checkout.

**Use instead:** add / throw in / drop in, sync, update, save a version,
set as head, out of sync / current.

Check any user-visible string you write or touch against this list before
finishing.

## Testing instructions

- Test runner is Vitest (`vitest.config.ts` at the repo root).
- Run everything: `npm test`.
- Server tests live under `packages/server/tests`.
- When you change server behavior (store logic, git wrapping, API routes,
  CLI commands), add or update the corresponding test.
- When you change client-only behavior (renderer, IPC, mirror/sync logic),
  check for and update client-side tests too.
- Add tests for the code you change, even if it wasn't explicitly asked
  for.
- Fix any test or type error until the whole suite is green before
  considering a task done.

## Non-negotiable product constraints

These come directly from `spec.md`. They are not implementation details to
be traded off — treat crossing any of them as a spec violation, and flag it
to the user instead of quietly working around it.

- **No merge UI or merge engine, at any level.** Two people submitting
  divergent versions of the same Part is a coordination gap, not a
  technical conflict — it's handled by work status (social) and sync
  status (visibility), not by resolving it in code.
- **No client-side branching, duplicating, or "start my own copy."** The
  GUI must never offer this. A server-side, admin-only branch/copy
  operation may exist, but it is never exposed to the client's UI, IPC
  bridge, or preload script.
- **No login or auth screen.** The trust model is LAN-based, by design.
- **The GUI has no independent authority over data.** It reflects and
  requests; the server decides. The client's local mirror is a cache of
  server state, never a second source of truth — anything deleted on the
  server must disappear from every client's mirror and GUI on next sync.
- **Sync status, download status, and work status stay separate**, always
  independently and simultaneously visible. Never collapse them into one
  indicator or let one imply another.
- **No complex assembly/reference resolution.** Cross-part references stay
  the user's responsibility, same as today — don't build auto-updating
  reference tracking.
- **No git vocabulary in the user-facing product** — see Code Style above.

## Working across the server/client split

- `server` and `client` communicate over plain JSON HTTP(S) — no
  websockets. The client polls `/api/health` and refetches the org
  snapshot when the revision number changes.
- Design goal is CLI/GUI parity: anything the GUI can do over HTTP, the
  server's CLI should be able to do too. If you add or change a
  server-side capability, check whether a corresponding CLI command needs
  adding or updating alongside it.
- If you're touching the client, confirm the change doesn't add local
  authority over data, doesn't add a duplicate/branch action, and doesn't
  introduce banned vocabulary into any string a user will see.

## PR / commit instructions

- Always run `npm run typecheck` and `npm test` before committing —
  RELEASE.md treats this as the standard pre-ship gate, and it's a
  reasonable gate for any commit.
- When a change affects product behavior described in `spec.md`, the
  architecture described in `spec2.md`, or the release process described
  in `RELEASE.md`, update the relevant doc as part of the same change —
  don't leave the docs to fall out of sync with what the code now does.
- Keep commit messages and PR descriptions focused on what changed and
  why; this repo doesn't require a specific title format beyond that.

## Security / operational notes

- No login/auth is intentional — don't add credential handling.
- HTTPS support uses TOFU (trust-on-first-use): the server generates its
  own CA on first run with `--tls`, prints a fingerprint, and the client
  pins it after the person compares and confirms. Don't route around this
  confirmation step or silently auto-trust a new server identity.
- The server is the only machine that needs `git` installed and the only
  place org data is authoritative — treat its data directory
  (`SOLIDSYNC_DIR`, default `~/.solidsync`) as the thing to back up, not
  any individual client's mirror.