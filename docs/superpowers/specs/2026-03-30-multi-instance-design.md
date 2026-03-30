# Multi-Instance Support Design

**Date:** 2026-03-30
**Branch:** `feat/multi-instance`
**Approach:** Instance Context Object (Approach B)

## Problem

OpenACP currently supports only one instance per machine. All config, data, sessions, and runtime state are hardcoded to `~/.openacp/`. Users who want to run multiple instances with different configurations (different bots, different agents, different channels) cannot do so.

## Goals

- Run multiple independent OpenACP instances on the same machine simultaneously
- Each instance has its own config, sessions, agents, plugins, ports, and lifecycle
- Auto-detect local instances, support explicit flags for control
- Optionally clone settings from global instance when creating a new local instance
- Full backward compatibility — existing users see no change

## Non-Goals

- Shared sessions or real-time sync between instances
- GUI for managing multiple instances
- Remote instance management

---

## Design

### 1. InstanceContext

A single object that holds all resolved paths for an instance. Created once at CLI entry, passed down through the constructor chain.

```typescript
interface InstanceContext {
  /** Instance root directory (e.g. ~/.openacp or /project/.openacp) */
  root: string
  /** Whether this is the global instance */
  isGlobal: boolean
  /** All resolved paths — derived from root */
  paths: {
    config: string         // root/config.json
    sessions: string       // root/sessions.json
    agents: string         // root/agents.json
    registryCache: string  // root/registry-cache.json
    plugins: string        // root/plugins/
    pluginsData: string    // root/plugins/data/
    pluginRegistry: string // root/plugins.json
    logs: string           // root/logs/
    pid: string            // root/openacp.pid
    running: string        // root/running
    apiPort: string        // root/api.port
    apiSecret: string      // root/api-secret
    bin: string            // root/bin/
    cache: string          // root/cache/
    tunnels: string        // root/tunnels.json
    agentsDir: string      // root/agents/ (binary agent installs)
  }
}
```

#### Path Resolution (CLI entry, runs once)

Priority order:

1. `--dir <path>` flag → `<path>/.openacp`
2. `--local` flag → `cwd/.openacp`
3. `--global` flag → `~/.openacp`
4. cwd contains `.openacp/` directory → `cwd/.openacp` (auto-detect, no prompt)
5. No flag, no local dir, global exists → prompt user: "Use your main setup or create a new one here?"
6. Nothing exists → full setup wizard at `~/.openacp` (same as current behavior)

#### Propagation

```
CLI entry (resolveInstanceRoot)
  → startServer(ctx)
    → ConfigManager(ctx)
    → OpenACPCore(ctx)
      → SessionStore(ctx.paths.sessions)
      → AgentStore(ctx.paths.agents)
      → LifecycleManager(ctx)
        → PluginContext (storagePath = ctx.paths.pluginsData/<name>/)
```

Plugins receive their scoped storage path through `PluginContext` (existing pattern). Only the root changes — plugin code does not need to know about multi-instance.

### 2. Instance Registry

A central registry at `~/.openacp/instances.json` (always in global dir) that tracks all known instances for `openacp status --all`.

```typescript
interface InstanceRegistry {
  version: 1
  instances: Record<string, InstanceEntry>  // key = root path
}

interface InstanceEntry {
  root: string
  isGlobal: boolean
  pid: number | null       // null if not running
  apiPort: number | null
  tunnelPort: number | null
  createdAt: string        // ISO
  lastStartedAt: string    // ISO
  label?: string           // optional friendly name
}
```

#### Lifecycle

- **On start:** Register instance with PID + ports. PID file still written to `<root>/openacp.pid`.
- **On stop:** Update `pid: null`, keep entry (instance still exists, just not running).
- **On status --all:** Read registry, verify each PID is alive via `process.kill(pid, 0)`, update stale entries.
- **Stale cleanup:** Automatic when reading registry — dead PIDs get cleared.

#### Singleton Check Change

Current: Check PID at `~/.openacp/openacp.pid` → blocks ALL instances.
New: Check PID at `<root>/openacp.pid` → only blocks duplicate of same instance. Different roots run concurrently.

### 3. Port Auto-Detection

When running multiple instances, ports will conflict if both use defaults.

- **API server:** Default 21420. If occupied, try +1 up to 10 retries. Write actual port to `<root>/api.port`.
- **Tunnel:** Already has retry logic (tries port+1 up to 10 times). Change path to `<root>/tunnels.json`.
- **User-pinned port:** If user sets a specific port in config, use that exact port. Fail with clear error if occupied (no auto-increment).

### 4. Local Instance Creation & Clone-once Inheritance

#### Creation Flow

```
openacp --local  (or user picks "new setup here" from prompt)
  → cwd/.openacp/ does not exist
  → "Set up a new OpenACP here?"
  → Check if any existing instance is available to clone from
    → One or more exist:
      → "Use settings from an existing setup as a starting point?"
        → Yes: pick source instance (see Source Selection below)
          → clone inheritable fields → run setup for remaining fields
        → No: run full setup from scratch
    → None exist: run full setup from scratch
```

#### Clone Source Selection

User can clone from **any existing instance**, not just global. Two ways:

**Interactive (no flag):**
```
? Use settings from an existing setup as a starting point? (Y/n) Y
? Which setup to copy from?
  ● Main setup (~/.openacp)
    ~/my-project/.openacp
    ~/other-project/.openacp
```

Each option shows the full path so the user knows exactly where it is.

**CLI flag:** `--from <path>` to skip the prompt:
```
openacp --local --from ~/.openacp
openacp --local --from ~/other-project/.openacp
openacp --dir /new/path --from ~/existing/.openacp
```

Validation: `--from` path must contain a valid `.openacp/` directory with a `config.json`. Error with clear message if not found.

The list of available instances comes from the Instance Registry (`~/.openacp/instances.json`). If a registered instance's directory no longer exists, it is skipped.

#### Plugin Inheritance Declaration

Each plugin declares which settings keys are safe to copy:

```typescript
interface PluginDefinition {
  // ... existing fields
  inheritableKeys?: string[]
}
```

Examples:

| Plugin | Inheritable | Not Inheritable (needs per-instance setup) |
|--------|-------------|-------------------------------------------|
| Telegram | — | `botToken`, `chatId` (each instance needs its own bot) |
| Discord | — | `botToken`, `guildId` |
| Slack | — | `botToken`, `appToken`, `signingSecret` |
| Tunnel | `provider`, `maxUserTunnels`, `auth` | `port` (would conflict) |
| API server | `host` | `port` (would conflict) |
| Security | `allowedUsers`, `maxSessionsPerUser`, `rateLimits` | — |
| Usage | `budget` | — |
| Speech | `stt.provider`, `tts` | API keys |

#### Clone Process

1. Copy `config.json` from source → target (reset port fields to defaults for auto-detect)
2. Copy `plugins.json` (registry — knows which plugins are enabled)
3. Copy `plugins/package.json` and `plugins/node_modules/` (installed community plugins — avoids re-downloading)
4. Copy `agents.json` and `agents/` directory (installed agent definitions + binaries)
5. Copy `bin/` directory (installed binaries like cloudflared — avoids re-downloading)
6. For each enabled plugin with `inheritableKeys`:
   - Read source `plugins/data/<name>/settings.json`
   - Keep only inheritable keys
   - Write to target `plugins/data/<name>/settings.json`
7. Run setup wizard for missing required fields (bot tokens, etc.)
   - Wizard detects partial setup → only asks for fields not yet configured

#### Never Cloned

Sessions, logs, cache, PID file, tunnel registry, api.port, api-secret — each instance starts clean with its own runtime state.

### 5. CLI Changes

#### New Flags

```
openacp [command] [--local | --global | --dir <path>] [--from <path>]
```

- `--local` — use/create `.openacp/` in current directory
- `--global` — always use `~/.openacp/`
- `--dir <path>` — use/create `.openacp/` at specified path (creates directory if it doesn't exist)
- `--from <path>` — when creating a new instance, copy settings from this existing instance (must contain `.openacp/config.json`)

These flags apply to ALL commands: `start`, `stop`, `status`, `config`, `logs`, `plugins`, etc. (`--from` only applies during instance creation.)

#### New Subcommand

```
openacp status --all    # show all known instances
```

Output:
```
┌──────────┬──────────────────────────────┬─────────┬──────┬────────┐
│ Status   │ Location                     │ PID     │ API  │ Tunnel │
├──────────┼──────────────────────────────┼─────────┼──────┼────────┤
│ ● online │ ~/.openacp (main)            │ 12345   │ 21420│ 3100   │
│ ● online │ ~/my-project/.openacp        │ 12389   │ 21421│ 3101   │
│ ○ offline│ ~/other/.openacp             │ —       │ —    │ —      │
└──────────┴──────────────────────────────┴─────────┴──────┴────────┘
```

#### Auto-detect Logic (no prompt needed)

1. `.openacp/` exists in cwd → use it
2. Any explicit flag → follow it
3. No local dir + no flag + global exists → prompt (shows full paths):
   ```
   ? How would you like to run OpenACP?
     ● Use main setup (/Users/you/.openacp)
       Create a new setup here (/Users/you/current-dir/.openacp)
   ```
4. Nothing exists → full setup wizard (current behavior)

#### User-Facing Language

All prompts use plain language, always show full paths so user knows exactly where things are:

| Internal concept | User-facing text |
|-----------------|-----------------|
| Global instance | "Main setup (/full/path/.openacp)" |
| Local instance | "Setup in this folder (/full/path/.openacp)" |
| Clone source | "Use settings from an existing setup as a starting point" |
| Instance root | "location" with full path shown |
| Auto-detect | (no message, just works) |
| CLI shortcut | Show equivalent command, e.g. "Tip: next time use `openacp --local`" |

### 6. Files to Modify

#### Core (receive `InstanceContext` via constructor)

- `ConfigManager` — receive `ctx.paths.config` instead of hardcoded path
- `OpenACPCore` — receive ctx, pass to session store, command registry
- `LifecycleManager` — receive ctx, use `ctx.paths.pluginsData` for plugin storage
- `SessionStore` — receive `ctx.paths.sessions`
- `AgentStore` — receive `ctx.paths.agents`
- `AgentCatalog` — receive `ctx.paths.registryCache`
- `AgentInstaller` — receive `ctx.paths.agentsDir` for binary agent installs
- `SettingsManager` — receive `ctx.paths.pluginsData` as base
- `PluginRegistry` — receive `ctx.paths.pluginRegistry`

#### CLI Commands (receive ctx from resolution)

- `daemon.ts` — PID path, log dir, running marker from ctx
- `default.ts` — use ctx instead of module-level consts
- `api-client.ts` — port file, secret file from ctx
- `plugins.ts` — registry path, plugins dir from ctx
- `install.ts` / `uninstall.ts` — plugins dir from ctx
- `reset.ts` — root dir from ctx
- `start.ts` / `stop.ts` / `status.ts` — ctx-aware
- `autostart.ts` — launchd/systemd paths (global only)

#### Plugins (minimal — most already use PluginContext.storage)

- `api-server` — port file and secret file path from ctx instead of hardcode
- `tunnel-registry` — registry path from ctx instead of module-level const
- `context-manager` — cache path from ctx
- `file-service` — base path from ctx
- `install-binary` — bin dir from ctx

#### No Changes Needed

- Plugin business logic (telegram, discord, slack, speech, security, usage, notifications)
- Agent subprocess spawning
- Middleware chain, event bus, service registry

### 7. New Code

1. `InstanceContext` type + `resolveInstanceRoot()` function + `createInstanceContext()` factory
2. `InstanceRegistry` class (read/write `~/.openacp/instances.json`)
3. Clone logic in setup wizard (partial setup detection + inheritance)
4. `inheritableKeys` field in plugin definition type
5. API server port auto-detect (tunnel already has this)
6. `--local`, `--global`, `--dir`, `--from` flag parsing in CLI entry
7. `status --all` subcommand
8. User-facing prompt when no flag and cwd has no `.openacp/` (with full paths)
9. Clone source selection UI (list existing instances from registry, validate `--from` path)

### 8. Backward Compatibility

| Scenario | Before | After |
|----------|--------|-------|
| `openacp` with existing `~/.openacp/` | Starts global | Same — starts global |
| `~/.openacp/config.json` from old version | Loads fine | Loads fine, no migration needed |
| Daemon running, upgrade version | PID check at `~/.openacp/openacp.pid` | Same path, same check |
| `OPENACP_CONFIG_PATH` env var | Overrides config path | Still works, overrides `ctx.paths.config` |
| All `OPENACP_*` env vars | Override config values | Still work as before |
| No `.openacp/` in cwd, no flags | Goes to global | Same — goes to global (with prompt if global exists) |

The `instances.json` file is new and additive — old versions simply won't have it.
