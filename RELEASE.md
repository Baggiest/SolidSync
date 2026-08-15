# Releasing SolidSync

How to build and package a release. Short version: bump, build, grab files.

## 1. Bump the version

One command rewrites every version location (all `package.json` files, the
lockfile, and the single source of truth in `packages/shared/src/version.ts`):

```bash
npm run bump -- 0.3.0 --tag
```

Drop `--tag` if you don't want a `git tag vX.Y.Z` created. Run `npm run bump` with
no args to see usage.

## 2. Clean out stale build output

Old installers (and leftover artifacts from before the SolidGit→SolidSync
rename) can linger:

```bash
rm -rf packages/client/dist packages/client/out packages/server/dist
```

## 3. Build the desktop app 

(NOT IMPLEMENTED YET TODO)`build:all` chains `electron-vite build` + `electron-builder` for Windows AND Linux:

```bash
# npm run build:all
```

Or pick one platform:

```bash
npm run build:win     # NSIS installer + portable zip
npm run build:linux   # .deb
```

> Windows builds work on Linux if Wine is installed (`which wine`). The packaged
> app version comes from `packages/client/package.json`, kept in sync by the
> bump script.

## 4. Build the server bundle

```bash
npm run build:server  # esbuild → packages/server/dist
```

## 5. Collect the release files

| File | Path |
|------|------|
| Linux installer | `packages/client/dist/SolidSync-<ver>-amd64.deb` |
| Windows installer (NSIS) | `packages/client/dist/SolidSync-<ver>-x64.exe` |
| Windows portable | `packages/client/dist/SolidSync-<ver>-x64-portable.zip` |
| Auto-update manifest | `packages/client/dist/latest-linux.yml` |
| Server (run anywhere) | `packages/server/dist/` → `cli.js` + `sql-wasm.wasm` |

## Verify

Before shipping:

```bash
npm run typecheck
npm test
```
