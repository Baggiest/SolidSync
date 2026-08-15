# solidsync

Headless SolidSync shop server with a CLI: org DB, per-project git repos, REST API.

No login, no cloud, no PDM seat. One server on your shop network, the [SolidSync](https://github.com/) desktop clients point at it.

## Install

Requires Node.js 20+ and git on the server machine.

```bash
npm install -g solidsync
```

## Run

```bash
solidsync-server serve
```

That's it. It binds `0.0.0.0:3020` by default and prints the URL your team's clients should point at (`http://<LAN-IP>:3020`).

## Configuration

Everything is optional; the defaults work for most shops.

| Option | Env var | Default | Meaning |
|---|---|---|---|
| `--dir PATH` | `SOLIDSYNC_DIR` | `~/.solidsync` | where org data lives |
| `--port N` | `SOLIDSYNC_PORT` | `3020` | HTTP port |
| `--host IP` | `SOLIDSYNC_HOST` | `0.0.0.0` | bind address |
| `--name NAME` | `SOLIDSYNC_NAME` | `Shop` | org name shown in the UI |

```bash
solidsync-server serve --port 3020 --name "Fab Shop"
```

## Commands

| Command | Purpose |
|---|---|
| `serve` | Run the server in the foreground |
| `init` | Create/repair the org data folder, then exit |
| `health` | Print server health as JSON |
| `list` | Print the org tree (projects → sections → parts) |
| `import FILE` | Throw a file into a section on a running server |
| `status PARTID` | Show/stamp a part's work status |
| `branch PROJECT` | Start an independent copy of a project |
| `archive PROJECT` | Move a project into the Archived section |
| `unarchive PROJECT` | Bring an archived project back |
| `backup [FILE]` | Snapshot the whole org into one archive |
| `version` | Print the server version |

Run `solidsync-server --help` for the full usage.

## Data

Everything lives under the `--dir` folder (default `~/.solidsync`):

```
~/.solidsync/
├── solidsync.db      # metadata (SQLite)
└── repos/<projectId>/ # per-project git repos holding the file bytes
```

Back up by copying the folder, or use `solidsync-server backup`.
