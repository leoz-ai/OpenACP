# Phase 1 — Startup Flow & Error Handling

## Startup Sequence

```
npx openacp
  │
  1. Ensure ~/.openacp/ exists
  │   Create directory if missing
  │   Create default config.json if missing (with instructions)
  │
  2. Load config
  │   ConfigManager.load("~/.openacp/config.json")
  │   Apply env var overrides (OPENACP_TELEGRAM_BOT_TOKEN, etc.)
  │   Validate with Zod
  │   Exit with clear error if invalid
  │
  3. Create core
  │   new OpenACPCore(configManager)
  │   Initialize AgentManager, SessionManager, NotificationManager
  │
  4. Register adapters
  │   For each enabled channel in config:
  │     telegram → import @openacp/adapter-telegram → registerAdapter()
  │
  5. Start core
  │   core.start()
  │     For each adapter: adapter.start()
  │
  6. Telegram auto-setup
  │   Check notificationTopicId → null → create "📋 Notifications" topic → save to config
  │   Check assistantTopicId → null → create "🤖 Assistant" topic → save to config
  │   Spawn assistant session (defaultAgent, keep alive)
  │   Send welcome in assistant topic: "OpenACP is running! Ask me anything or /help"
  │
  7. Ready
  │   Log: "OpenACP started. Telegram bot active."
  │   Log: "Agents: claude, codex"
  │   Log: "Press Ctrl+C to stop."
  │
  ── Ctrl+C / SIGTERM ──
  │
  8. Graceful shutdown
      core.stop()
        Send "OpenACP shutting down" in notification topic
        Cancel all active session prompts
        SIGTERM all agent subprocesses
        Wait up to 10s for exit
        SIGKILL remaining
        Stop bot polling
        Exit 0
```

## Default Config Generation

When `~/.openacp/config.json` doesn't exist, generate:

```json
{
  "channels": {
    "telegram": {
      "enabled": false,
      "botToken": "YOUR_BOT_TOKEN_HERE",
      "chatId": 0,
      "notificationTopicId": null,
      "assistantTopicId": null
    }
  },
  "agents": {
    "claude": {
      "command": "claude-agent-acp",
      "args": [],
      "env": {}
    },
    "codex": {
      "command": "codex",
      "args": ["--acp"],
      "env": {}
    }
  },
  "defaultAgent": "claude",
  "workspace": {
    "baseDir": "~/openacp-workspace"
  },
  "security": {
    "allowedUserIds": [],
    "maxConcurrentSessions": 5,
    "sessionTimeoutMinutes": 60
  }
}
```

And log:
```
Config created at ~/.openacp/config.json
Please edit it with your Telegram bot token and chat ID, then restart.
```

## Error Handling

### Startup Errors

| Error | Action |
|-------|--------|
| Config file missing | Create default, log instructions, exit 1 |
| Config invalid (Zod) | Log field-by-field errors, exit 1 |
| Bot token invalid | Log "Invalid Telegram bot token", exit 1 |
| Chat ID = 0 | Log "Set your Telegram chat ID in config", exit 1 |
| Agent command not found | Warning only (agent fails on spawn, not startup) |
| No agents configured | Log "No agents in config", exit 1 |

### Runtime Errors

| Error | Action |
|-------|--------|
| Agent command not found | Reply in topic: "Agent 'X' not found. /agents to see available." |
| Agent spawn fails | Reply: "Failed to start agent: {error}". Session status = error |
| Agent subprocess crashes | Session status = error. Show last stderr lines in topic + notification |
| ACP handshake fails | Kill subprocess, reply: "Agent incompatible: {error}" |
| ACP session create fails | Kill subprocess, reply: "Session creation failed: {error}" |
| Prompt fails | Session status = error, notify. Keep session alive for retry |
| Telegram API 429 (rate limit) | Throttle already handles. If still 429 → exponential backoff |
| Telegram API error (other) | Log, retry once, then surface to user |
| Topic creation fails | Reply in general: "Cannot create topic. Check bot permissions." |
| Message edit fails | Fallback: send new message instead of edit |
| Permission timeout | Do nothing (agent waits). Notify in notification topic after 5 min |
| Workspace path invalid | Reply: "Invalid path: {path}" |
| Max sessions reached | Reply: "Max concurrent sessions ({N}) reached. /cancel a session first." |

### Agent Subprocess Crash Recovery

```typescript
// In AgentInstance — detect subprocess exit
this.child.on('exit', (code, signal) => {
  if (code !== 0 && code !== null) {
    const stderr = this.stderrCapture.getLastLines()
    this.onSessionUpdate({
      type: 'error',
      message: `Agent crashed (exit code ${code})\n${stderr}`,
    })
  }
})

// Connection close detection
this.connection.closed.then(() => {
  if (session.status === 'active') {
    session.status = 'error'
    this.onSessionUpdate({
      type: 'error',
      message: 'Agent connection lost',
    })
  }
})
```

## Process Signal Handling

```typescript
// packages/core/src/main.ts
let shuttingDown = false

const shutdown = async (signal: string) => {
  if (shuttingDown) return  // prevent double shutdown
  shuttingDown = true
  console.log(`\n${signal} received. Shutting down...`)

  try {
    await core.stop()
  } catch (err) {
    console.error('Error during shutdown:', err)
  }

  process.exit(0)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err)
  // Don't exit — try to keep running
})

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err)
})
```

## Logging

Phase 1: simple console logging to stdout/stderr.

```typescript
const log = {
  info: (...args: unknown[]) => console.log(new Date().toISOString(), '[INFO]', ...args),
  warn: (...args: unknown[]) => console.warn(new Date().toISOString(), '[WARN]', ...args),
  error: (...args: unknown[]) => console.error(new Date().toISOString(), '[ERROR]', ...args),
  debug: (...args: unknown[]) => {
    if (process.env.OPENACP_DEBUG) console.log(new Date().toISOString(), '[DEBUG]', ...args)
  },
}
```

Enable debug logging: `OPENACP_DEBUG=1 npx openacp`
