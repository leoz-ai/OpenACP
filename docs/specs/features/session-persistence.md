# Feature: Session Persistence & Resume

**Phase**: 3

## Overview

Save session state so conversations can be resumed after restart. Users can also fork sessions to branch conversations.

## What Gets Persisted

- Session metadata (id, agent, channel, thread, status, name, timestamps)
- Conversation history (messages exchanged between user and agent)
- Agent state (if ACP agent supports `session/load`)

## Storage

Simple file-based storage:

```
~/.config/openacp/sessions/
  {session-id}/
    metadata.json
    history.json
```

## Resume Flow

```
1. OpenACP restarts
2. Load session metadata from disk
3. For each session with status = 'active':
   a. Re-spawn agent subprocess
   b. ACP session/load (if agent supports it)
   c. Re-link to channel thread
   d. Session is active again
```

## Session Forking

```
User types /fork in session topic
  → Create new session with same agent
  → Copy conversation history up to this point
  → New topic created for the fork
  → Both original and fork continue independently
```

## Cleanup

- Sessions older than N days → auto-cleanup (configurable)
- `/clear` command to manually delete session data
- Config: `sessions.retentionDays` (default: 30)

## Considerations

- Not all ACP agents support `session/load` — for those, only metadata and user-side history are restored
- Large conversation histories → consider compression or pagination
- Privacy: session data stored locally, never sent externally
