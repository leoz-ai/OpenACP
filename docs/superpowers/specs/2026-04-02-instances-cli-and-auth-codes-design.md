# Spec: Instances CLI & Auth Codes

**Date:** 2026-04-02
**Status:** Draft
**Related specs:**
- [Spec 1: API Server Core](./2026-03-31-api-server-core-design.md)
- [Spec 2: Auth System](./2026-03-31-auth-system-design.md)
- [Spec 4: App Connectivity](./2026-03-31-app-connectivity-design.md)
- [App Spec: Add Workspace Feature](../../OpenACP-App/docs/superpowers/specs/2026-04-02-add-workspace-feature-design.md)

## Overview

Two additions to the OpenACP core to support the Add Workspace feature in the desktop app:

1. **`openacp instances` CLI subcommand** — list and create instances with JSON output, replacing direct file reads in the app.
2. **Auth code exchange** — one-time codes for secure remote connection, replacing JWT-in-URL.
3. **`GET /api/v1/workspace` endpoint** — lets authenticated clients fetch workspace identity info.

---

## 1. `openacp instances` CLI Subcommand

### `openacp instances list`

Lists all registered instances with live status.

```
openacp instances list [--json]
```

**Status check per instance:**
1. Read `<root>/openacp.pid` — file missing → `stopped`
2. If PID file exists, check process alive → dead process → `stopped`
3. If process alive, `GET http://localhost:<port>/api/v1/system/health` → confirm → `running`

**JSON output (`--json`):**

```json
[
  {
    "id": "main",
    "name": "Main",
    "directory": "/Users/user",
    "root": "/Users/user/.openacp",
    "status": "running",
    "port": 21420
  },
  {
    "id": "my-project",
    "name": "My Project",
    "directory": "/Users/user/my-project",
    "root": "/Users/user/my-project/.openacp",
    "status": "stopped",
    "port": null
  }
]
```

All paths are absolute (no `~/` prefix). `directory` is the parent of `root` (the human-facing project folder).

**Human-readable output (no flag):** Table format — same as `openacp status --all` (defined in multi-instance spec).

---

### `openacp instances create`

Creates a new instance at a given directory, non-interactively.

```
openacp instances create
  --dir <path>              Target directory (system appends /.openacp internally)
  [--from <path>]           Clone settings from this existing instance directory
  [--name <name>]           Instance name (default: openacp-<N>)
  [--agent <agentName>]     Set default agent
  [--no-interactive]        Skip setup wizard entirely
  [--json]                  Print created instance info as JSON on completion
```

**Flow:**

```
→ Resolve --dir to absolute path
→ Check <dir>/.openacp already exists?
  → Yes + already in registry: error "Instance already exists at <dir> (id: <id>)"
  → Yes + not in registry: register it, skip creation
→ --from provided:
  → Validate <from>/.openacp/config.json exists
  → Clone using existing copy logic (from multi-instance spec)
  → Register new instance in ~/.openacp/instances.json
→ --no-interactive (no --from):
  → Create <dir>/.openacp/ directory structure
  → Write minimal config.json: { instanceName, runMode: "daemon" }
  → Write agents.json: [{ name: <agentName> }] if --agent provided
  → Register in ~/.openacp/instances.json
→ --json: print instance info to stdout
→ Exit 0
```

**JSON output (`--json`):**

```json
{
  "id": "my-project",
  "name": "My Project",
  "directory": "/Users/user/my-project",
  "root": "/Users/user/my-project/.openacp",
  "status": "stopped",
  "port": null
}
```

---

### `--json` on Onboarding Wizard

When the onboarding wizard completes (first-run setup), if `--json` flag is present, print the created instance info as a JSON block to stdout before handing off to daemon mode:

```
→ Setup wizard completes
→ Start server
→ Print JSON to stdout (one line): {"id":"main","name":"Main","directory":"/Users/user",...}
→ Daemon takes over stdout
```

The app reads this JSON line from sidecar stdout to capture the `id` of the newly created instance immediately.

---

## 2. Auth Code Exchange

### Motivation

The current `openacp remote` spec embeds the JWT directly in the URL (`?token=eyJ...`). Tokens in URLs can be logged by proxies, cached by browsers, and exposed in QR codes. Replacing the JWT with a short-lived one-time code means the actual token is never exposed in a URL.

### New Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/v1/auth/codes` | Secret token | Generate one-time code |
| `POST` | `/api/v1/auth/exchange` | None (code is credential) | Exchange code for JWT |

---

### `POST /api/v1/auth/codes`

Only callable with secret token auth.

**Request body:**
```json
{
  "role": "admin",
  "name": "remote-14h30-31-03-2026",
  "expire": "24h",
  "scopes": ["sessions:read"]
}
```
Same fields as `POST /api/v1/auth/tokens` — the code carries the intended token parameters.

**Response:**
```json
{
  "code": "abc123xyz",
  "expiresAt": "2026-04-02T14:35:00Z"
}
```

**Storage:** In-memory Map `code → { tokenParams, expiresAt, used: false }`. Codes expire after 5 minutes. Cleanup on exchange or expiry.

---

### `POST /api/v1/auth/exchange`

No authentication required — the code is the credential.

**Request body:**
```json
{ "code": "abc123xyz" }
```

**Flow:**
```
→ Look up code in store
→ Not found: 401 "Invalid code"
→ Found but expired: 401 "Code expired"
→ Found but already used: 401 "Code already used"
→ Mark code as used (single-use)
→ Call internal token generation with stored tokenParams
→ Return same response as POST /api/v1/auth/tokens
```

**Response:**
```json
{
  "accessToken": "eyJ...",
  "tokenId": "tok_abc123",
  "expiresAt": "2026-04-03T14:30:00Z",
  "refreshDeadline": "2026-04-09T14:30:00Z"
}
```

---

### `openacp remote` — Updated Link Format

```
openacp remote
  → POST /api/v1/auth/codes → code "abc123xyz"
  → Generate links:
    openacp://connect?host=<tunnel>&code=abc123xyz
    https://<tunnel>?code=abc123xyz
    http://localhost:<port>?code=abc123xyz
```

The `token=` query param in all link formats is replaced by `code=`.

---

## 3. `GET /api/v1/workspace`

Returns identity information about the current workspace/instance. Used by the app after connecting to a remote workspace to get the instance `id` and display info.

**Auth:** Any valid auth (secret token or JWT with `system:health` scope).

**Response:**
```json
{
  "id": "main",
  "name": "Main",
  "directory": "/Users/user",
  "version": "2026.401.1"
}
```

`directory` is the parent of the `.openacp` root — the human-facing project folder.

Note: `directory` is the server-side filesystem path, meaningful for display but not for connection routing (which uses `host`).

---

## Files to Add / Modify

### New Files (core)
- `src/cli/commands/instances.ts` — `instances list` and `instances create` subcommands
- `src/plugins/api-server/routes/workspace.ts` — `GET /api/v1/workspace` route
- `src/plugins/api-server/auth/code-store.ts` — in-memory code store
- `src/plugins/api-server/routes/auth-codes.ts` — `/api/v1/auth/codes` and `/api/v1/auth/exchange` routes

### Modified Files (core)
- `src/cli/commands/default.ts` — add `--json` flag support to onboarding wizard output
- `src/cli/commands/plugins.ts` / CLI entry — register `instances` subcommand
- `src/plugins/api-server/routes/auth.ts` — register new code exchange routes
- `src/plugins/api-server/server.ts` — register workspace route

### Modified Files (app)
See companion spec: [App Spec: Add Workspace Feature](../../OpenACP-App/docs/superpowers/specs/2026-04-02-add-workspace-feature-design.md)
