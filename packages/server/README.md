# solidsync-server

Headless SolidSync shop server with a CLI: org DB, per-project git repos, REST API.

No login, no cloud, no PDM seat. One server on your shop network, the [SolidSync](https://github.com/baggiest/solidsync) desktop clients point at it.

## Requirements

- Node.js 20+
- `git` on the machine that hosts the org (the version-storage engine). Clients never need it.
- `tar` for the `backup` command — ships with Windows 10+, macOS and Linux.

## Install

```bash
npm install -g solidsync
```

## Quick start

```bash
solidsync-server serve
```

That's it. It binds `0.0.0.0:3020` by default and prints the URL your team's clients should point at (`http://<LAN-IP>:3020`). It stays in the foreground; Ctrl+C stops it gracefully.

---

# Command-line reference

```
solidsync-server <command> [options]
```

Every flag has an `$SOLID…` environment-variable equivalent (see [Environment variables](#environment-variables)), so the server can be configured without touching the command line.

## Global flags

| Flag | Meaning |
|---|---|
| `-h`, `--help` | Print the full usage text and exit `0` |
| `--version` | Print the server version and exit `0` (same as the `version` command) |

Unknown commands print an error, show the usage text, and exit `1`.

## Commands

### serve

Run the server in the foreground and keep it running until Ctrl+C / SIGTERM.

```bash
solidsync-server serve [--dir PATH] [--port N] [--host IP] [--name NAME]
                       [--hostname NAME] [--tls] [--tls-port N]
```

On startup it prints the org name, host name, revision, the org data folder, the URL(s) it's listening on, the LAN URL to hand out to the team, and — with `--tls` — the CA path and fingerprint clients compare on first connect. Options only affect this run; the org data it serves is whatever lives in `--dir` (created on first run).

Run it in the background with `--daemon`:

```bash
solidsync-server serve --daemon
```

This detaches a child server process, redirects its output to a log file, and
exits `0` once the server answers health. The default log is `<dir>/server.log`
(or `--log PATH`). It prints the child's pid and writes a pid file (default
`<dir>/server.pid`, or `--pidfile PATH`) plus a launch record
(`<dir>/server.launch.json`) so `stop` / `restart` can find it.

```bash
solidsync-server serve --daemon --port 3020 --name "Fab Shop" --log /var/log/solidsync.log
# SolidSync server running in the background
#   pid      : 1234
#   log      : /var/log/solidsync.log
#   tell everyone: http://192.168.1.50:3020
#   stop it  : solidsync-server stop --dir /srv/solidsync   (or kill 1234)
```

If the server doesn't come up within ~15s, the command exits `1` and points at
the log so you can see why. The foreground `serve` (Ctrl+C) and `--daemon` are
the same server, same options, same env — `--daemon` is only a launch mode.

### stop

Stop a background server, identified by its pid file (or launch record):

```bash
solidsync-server stop                # stops the server in the default dir
solidsync-server stop --dir /srv/solidsync
```

Sends SIGTERM, waits up to 15s for a graceful shutdown, and cleans up the pid
file. The launch record is kept so `restart` can bring it back. Exit `1` (with
a message) if nothing is running.

### restart

Stop the current background server and start it again with the *exact* options
from its launch record — same dir, port, name, TLS, env. Useful after a host
reboot or a config-file change:

```bash
solidsync-server restart --dir /srv/solidsync
```

Works even if the old process is already dead (a crashed or rebooted daemon):
it just starts a fresh one. Exit `1` if there's no launch record (the server
was never started with `--daemon`).

### init

Create/repair the org data folder and exit. Idempotent — pointing it at an existing folder just opens it.

```bash
solidsync-server init [--dir PATH] [--name NAME] [--hostname NAME]
```

### health

Check a running server and print its health as pretty JSON (handy for scripting and smoke tests).

```bash
solidsync-server health [--url URL] [--user NAME] [--ca PATH]
```

```json
{
  "ok": true,
  "orgName": "Shop",
  "hostName": "copper-camel",
  "rev": 12,
  "serverTime": "2026-08-15T12:00:00.000Z",
  "version": "0.4.3"
}
```

Exit `0` when `ok` is true, `1` otherwise (or if the server is unreachable).

### list

Print the org tree — projects, sections, parts, each part's work status, head version, and last modifier. Use `--json` for the raw org snapshot.

```bash
solidsync-server list [--url URL] [--user NAME] [--ca PATH] [--json]
```

### import FILE

Throw a file into a section on a running server — the CLI equivalent of dragging a file into the GUI. It becomes a new part with a 6-digit ID derived from the file's hash.

```bash
solidsync-server import FILE [--project NAME] [--section NAME]
                             [--url URL] [--user NAME] [--ca PATH] [--json]
```

- Missing `--project` picks the first project (or creates one named `Shop`).
- Missing `--section` uses a section named `Parts`.
- If a project/section with that name doesn't exist, it's created.
- With `--json`, prints `{ ok, partId, versionId, project, section }`.

### status PARTID

Show a part's current state (work status, head version, version count, last change). PARTID is a full 6-digit ID or any case-insensitive prefix.

```bash
solidsync-server status PARTID [--set green|yellow|red]
                               [--url URL] [--user NAME] [--ca PATH] [--json]
```

- `--set green|yellow|red` stamps the work status (the same statuses the GUI shows). `--set` must be exactly `red`, `yellow`, or `green`.

### branch PROJECT

Start an independent copy of a project. **Admin-only, server-side** — this capability is deliberately not exposed in the GUI. The copy is created active, even if the original is archived.

```bash
solidsync-server branch PROJECT [NEWNAME] [--url URL] [--user NAME] [--ca PATH] [--json]
```

### archive PROJECT

Move a project out of the active list and into the Archived section of clients. Nothing is deleted — the project stays on the server, fully browsable.

```bash
solidsync-server archive PROJECT [--url URL] [--user NAME] [--ca PATH] [--json]
```

### unarchive PROJECT

Bring an archived project back into the active list, with sections, parts, versions, statuses, and head pointers intact.

```bash
solidsync-server unarchive PROJECT [--url URL] [--user NAME] [--ca PATH] [--json]
```

### backup [FILE]

Snapshot the whole org — DB plus all per-project git repos — into one `tar.gz` archive. Back up the single source of truth, not individual clients.

```bash
solidsync-server backup [FILE] [--dir PATH]
```

- Without `FILE`, writes `solidsync-backup-<timestamp>.tar.gz` in the current directory.
- Requires the org folder to exist (run `init` or `serve` first).
- The archive opens in Explorer / macOS Finder like a normal zip.

### version

Print the server version.

```bash
solidsync-server version
```

## Common options

| Option | Env var | Default | Meaning |
|---|---|---|---|
| `--dir PATH` | `SOLIDSYNC_DIR` | `~/.solidsync` | org data folder |
| `--port N` | `SOLIDSYNC_PORT` | `3020` | HTTP port (`serve`) |
| `--host IP` | `SOLIDSYNC_HOST` | `0.0.0.0` | bind address (`serve`) |
| `--name NAME` | `SOLIDSYNC_NAME` | `Shop` | org name shown in the UI |
| `--hostname NAME` | `SOLIDSYNC_HOSTNAME` | *(random)* | friendly server name shown in clients |
| `--url URL` | — | `http://127.0.0.1:<port>` | server base URL for client-ish commands |
| `--user NAME` | `SOLIDSYNC_USER` | `you` | your name, sent as `X-User` |
| `--json` | — | off | machine-readable output where supported |
| `--daemon` | `SOLIDSYNC_DAEMON` | off | run `serve` in the background, logging to `--log` |
| `--log PATH` | `SOLIDSYNC_LOG` | `<dir>/server.log` | log file for `--daemon` |
| `--pidfile PATH` | `SOLIDSYNC_PIDFILE` | `<dir>/server.pid` | pid file for `--daemon` (read by `stop`/`restart`) |
| `--tls` | `SOLIDSYNC_TLS=true` | off | also serve HTTPS (`serve`) |
| `--tls-port N` | `SOLIDSYNC_TLS_PORT` | `3443` | HTTPS port (`serve`) |
| `--ca PATH` | `SOLIDSYNC_CA` | — | CA cert file for HTTPS client commands |

`--hostname` resolution: your flag wins, then whatever was persisted for this org, then a random fruit/animal name from a fixed list. The result is stored in the org DB and reported on `/api/health`, so clients label the server with it — cosmetic identity only, never authoritative org data.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | success (including `--help` / `--version`) |
| `1` | expected error — bad usage, missing file/project, unreachable server, `tar` failure |
| `2` | unexpected crash (an unhandled exception) |

## TLS (HTTPS)

Public CAs won't issue certificates for LAN IPs, so SolidSync does its own TOFU (trust on first use):

```bash
solidsync-server serve --tls
```

- First run generates a throwaway CA + server cert under `<org-dir>/tls/` and prints the CA fingerprint.
- Plain HTTP stays up on `--port`; HTTPS is served on `--tls-port` (default `3443`).
- Clients compare the printed fingerprint on first connect and pin it (see the desktop app's server settings).
- CLI commands talk to an HTTPS server with `--ca PATH` (or `$SOLIDSYNC_CA`): `health`, `list`, `import`, `status`, `branch`, `archive`, `unarchive`.

## Environment variables

Every `serve`-or-command option above has an env-var equivalent (`SOLIDSYNC_DIR`, `SOLIDSYNC_PORT`, `SOLIDSYNC_HOST`, `SOLIDSYNC_NAME`, `SOLIDSYNC_HOSTNAME`, `SOLIDSYNC_USER`, `SOLIDSYNC_TLS`, `SOLIDSYNC_TLS_PORT`, `SOLIDSYNC_CA`, `SOLIDSYNC_DAEMON`, `SOLIDSYNC_LOG`, `SOLIDSYNC_PIDFILE`). A command-line flag always wins over the environment; the environment wins over the default.

```bash
SOLIDSYNC_DIR=/srv/solidsync SOLIDSYNC_PORT=3020 SOLIDSYNC_NAME="Fab Shop" \
  solidsync-server serve
```

## Data

Everything lives under the `--dir` folder (default `~/.solidsync`):

```
~/.solidsync/
├── solidsync.db      # metadata: projects, sections, parts, versions, statuses
├── tls/              # generated CA + server cert (when serving with --tls)
└── repos/<projectId>/ # per-project git repos holding the file bytes
```

Back up by copying the folder, or use `solidsync-server backup`.