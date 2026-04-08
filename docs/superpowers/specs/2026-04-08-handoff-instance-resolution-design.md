# Handoff Instance Resolution Design

**Date**: 2026-04-08
**Status**: Draft

## Problem

When multiple OpenACP instances run on the same machine (e.g., global `~/.openacp/` + local project `~/workspace/.openacp/`), the handoff flow always targets the global instance. The CLI `adopt` command hardcodes `~/.openacp/api.port` — it has no awareness of local instances.

Users commonly work in workspaces with nested project directories. An agent running in `~/workspace/project-A/src/core/` should handoff to the instance at `~/workspace/.openacp/` if one is running, not to the unrelated global instance.

## Design

### Instance Resolution Algorithm

Add a `resolveInstanceRoot(cwd)` utility that walks up the directory tree from the agent's working directory, looking for a running `.openacp/` instance:

```
resolveInstanceRoot(cwd):
  dir = cwd
  while dir != os.homedir()'s parent:
    candidate = path.join(dir, '.openacp')
    if candidate exists:
      port = read candidate/api.port
      if port exists AND health check passes:
        return candidate          // found running instance
      else:
        continue walking up       // instance exists but not running, skip
    dir = path.dirname(dir)

  // fallback: global instance
  global = ~/.openacp
  if global has api.port AND health check passes:
    return global

  // nothing running
  throw error "No running OpenACP instance found"
```

**Key behaviors:**
- Nearest running instance wins (like `.git` discovery)
- Dead instances (exist but not running) are skipped — continue walking up
- Fallback to global `~/.openacp/` if no local instance found
- Stop walking at `$HOME`'s parent directory
- Health check: read `api.port` file + HTTP GET to `/api/v1/system/health`

### Changes Required

#### 1. New utility: `resolveInstanceRoot()`

**Location**: `src/core/instance/resolve-instance.ts`

```typescript
export async function resolveInstanceRoot(cwd: string): Promise<string>
```

- Accepts the agent's working directory
- Returns the instance root path (e.g., `~/workspace/.openacp/`)
- Uses existing `readApiPort()` and health check logic from `instance-discovery.ts`
- Throws descriptive error if no running instance found

#### 2. Modify CLI `adopt.ts`

Replace the current hardcoded port resolution:

```typescript
// Before
const port = await readApiPort()

// After
const instanceRoot = await resolveInstanceRoot(cwd ?? process.cwd())
const port = await readApiPort(instanceRoot)
```

- `cwd` comes from the `--cwd` flag (already available in adopt command)
- If `--cwd` not provided, falls back to `process.cwd()` (current behavior)

#### 3. No changes to shell scripts

The handoff scripts (`openacp-handoff.sh`, `openacp-inject-session.sh`) and slash commands remain unchanged. They already pass `--cwd` to `openacp adopt`. This means:
- Users who already integrated don't need to re-run `openacp integrate`
- Backward compatible — old installs work without changes

### Edge Cases

| Scenario | Behavior |
|----------|----------|
| Nested instances: `~/workspace/.openacp/` + `~/workspace/project/.openacp/` | Nearest running instance wins |
| Instance dir exists but daemon is dead | Skip, continue walking up |
| No local instance, global is running | Fallback to global |
| No instance running anywhere | Error: "No running OpenACP instance found" |
| `--cwd` not provided | Use `process.cwd()` |
| Agent in deeply nested dir (`~/workspace/project/src/core/utils/`) | Walks up all levels until finding `.openacp/` |

### What Does NOT Change

- Shell hook scripts (no re-integration needed)
- Daemon-side adopt logic (`core.adoptSession()`)
- API endpoints
- Session storage format
- Instance registry format
- Any other CLI commands (they can adopt `resolveInstanceRoot` later)

## Testing

1. **Unit tests for `resolveInstanceRoot()`**:
   - Walk up finds nearest instance
   - Skips dead instances, finds next running one
   - Falls back to global when no local instance
   - Errors when nothing is running
   - Stops at `$HOME` parent

2. **Integration test**:
   - Two instances running (local + global), adopt from nested CWD routes to local
