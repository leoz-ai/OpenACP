# Session Cleanup Design

## Problem

After extended use, OpenACP creates many forum topics (one per session) in the Telegram/Discord group. Users need to bulk-clean old sessions and their associated chat threads, but doing it manually is tedious and there's no easy way to know which sessions are inactive.

## Solution

Extend the existing `TopicManager.cleanup()` and `openacp api cleanup` into a full interactive cleanup flow, accessible from both CLI and chat platforms.

## User Flows

### CLI Flow

```
openacp api cleanup                              # List cleanable sessions, prompt to delete
openacp api cleanup --list                       # List only, no delete
openacp api cleanup --status finished,cancelled  # Filter by status
openacp api cleanup --older-than 7d              # Filter by age
openacp api cleanup --all                        # All non-active sessions
openacp api cleanup --yes                        # Skip confirmation prompt
```

**Output format:**

```
Sessions to clean up:
  #  Name                Agent    Status      Created       Last Active
  1  Fix login bug       claude   finished    2d ago        1d ago
  2  Add dark mode       claude   cancelled   5d ago        5d ago
  3  Refactor tests      claude   error       1w ago        1w ago

Delete 3 sessions and their forum topics? [y/N]
```

### Chat Flow (`/cleanup` command)

1. User sends `/cleanup` in any topic (or system topic like Assistant/Notifications).
2. Bot replies with a list of non-active sessions, each showing: name, agent, status, relative time since last active.
3. All sessions are selected by default. Each session has a toggle button (select/deselect). "Select All" and "Cancel" buttons at the bottom.
4. After selection, a "Delete Selected (N)" button appears.
5. Bot confirms: "Deleted N sessions and forum topics." or reports partial failures.
6. Pagination with Prev/Next buttons if > 10 sessions.

## Architecture

### Core Layer (Adapter-Agnostic)

Two new methods on `OpenACPCore`:

```typescript
// List sessions eligible for cleanup
listCleanableSessions(filter?: CleanupFilter): SessionRecord[]

interface CleanupFilter {
  status?: SessionStatus[]        // e.g. ['finished', 'cancelled', 'error']
  olderThan?: number              // milliseconds since lastActiveAt
  channelId?: string              // filter by channel
}

// Delete sessions and their platform threads
cleanupSessions(sessionIds: string[]): Promise<CleanupResult>

interface CleanupResult {
  deleted: string[]               // successfully deleted session IDs
  failed: Array<{ sessionId: string; error: string }>
}
```

**`cleanupSessions` logic:**
1. For each session ID:
   a. If session is active in memory: cancel it (abort prompt, mark cancelled)
   b. Call `adapter.deleteSessionThread(sessionId)` to delete the platform thread/topic
   c. Remove session record from `SessionStore`
2. Collect results: which succeeded, which failed
3. Return `CleanupResult`

### HTTP API Endpoints

```
GET  /api/sessions/cleanable?status=finished,cancelled&olderThan=7d
     → Returns array of SessionRecord matching the filter

POST /api/sessions/cleanup
     Body: { sessionIds: string[] }
     → Executes cleanup, returns CleanupResult
```

### Chat Command Handler

- Registered per adapter (Telegram: `bot.command('cleanup')`, Discord: slash command)
- Calls `core.listCleanableSessions()` to get the list
- Renders platform-appropriate UI (Telegram: inline keyboard with toggle buttons)
- On user confirmation, calls `core.cleanupSessions(selectedIds)`
- Reports results back to user

### Callback Routing (Telegram)

New callback prefix: `cl:` (cleanup) to avoid conflicts with existing `p:` (permission) and `m:` (menu) prefixes.

Button data format:
- `cl:toggle:<sessionId>` — toggle selection for a session
- `cl:all` — select all
- `cl:none` — deselect all
- `cl:delete` — confirm and delete selected
- `cl:cancel` — cancel cleanup
- `cl:page:<n>` — navigate to page N

## Error Handling

- **Topic already deleted on platform**: Log warning, still remove session record. Don't fail the whole operation.
- **API rate limiting**: If Telegram/Discord rate-limits during bulk delete, retry with backoff.
- **Concurrent cleanup calls**: Idempotent — if a session is already deleted, skip it gracefully.
- **No cleanable sessions**: Display "No sessions to clean up."
- **Active session selected**: Cancel it first (abort prompt, mark cancelled), then delete.

## Testing Strategy

### Unit Tests

- `listCleanableSessions()`: filter by status, by age, exclude active, empty store
- `cleanupSessions()`: happy path (all deleted), partial failure (some topics fail), already-deleted sessions
- Cleanup callback routing (Telegram button handlers)

### Integration Tests

- CLI: `openacp api cleanup --list` returns formatted table
- Full flow: list → select → cleanup → verify records removed
- Chat command: `/cleanup` → inline buttons → delete → confirmation message

### Edge Cases

- Session active in memory: cancel before delete
- Topic already manually deleted on Telegram: graceful skip
- Concurrent cleanup from CLI and chat simultaneously: idempotent
- Empty session list
- Session with no platform data (no topicId): skip platform delete, remove record only

## Files to Modify

### Core
- `src/core/core.ts` — Add `listCleanableSessions()` and `cleanupSessions()` methods
- `src/core/sessions/session-store.ts` — May need query helpers for filtering

### HTTP API
- `src/core/api/` — Add `/api/sessions/cleanable` and `/api/sessions/cleanup` endpoints

### CLI
- `src/cli.ts` or relevant CLI handler — Enhance `openacp api cleanup` with new flags and interactive output

### Telegram Adapter
- `src/adapters/telegram/adapter.ts` — Register `/cleanup` command, handle `cl:` callbacks
- `src/adapters/telegram/` — New file for cleanup UI rendering (inline keyboard builder, message formatter)

### Channel Adapter Interface
- `src/core/channel.ts` — No changes needed. `deleteSessionThread` already exists as optional method.

### Tests
- `src/core/__tests__/cleanup.test.ts` — Core cleanup logic tests
- `src/adapters/telegram/__tests__/cleanup.test.ts` — Telegram-specific UI tests
