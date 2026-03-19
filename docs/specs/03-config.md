# OpenACP — Configuration System

## Overview

Configuration is stored as a JSON file. It is the single source of truth for which channels, agents, and features are enabled. CLI and Web UI are interfaces that read/write this file.

## Config File Location

Default: `~/.openacp/config.json`

Override via environment variable: `OPENACP_CONFIG_PATH`

## Data Directory

```
~/.openacp/
  config.json              → Main configuration file
  data/
    sessions/              → Session persistence (Phase 3)
  logs/                    → Log files

~/openacp-workspace/       → Default workspace base directory (separate from .openacp)
```

## Full Schema

```json
{
  "channels": {
    "telegram": {
      "enabled": true,
      "botToken": "123456:ABC-DEF...",
      "chatId": -1001234567890,
      "notificationTopicId": null,
      "assistantTopicId": null
    },
    "discord": {
      "enabled": false,
      "botToken": "...",
      "guildId": "...",
      "forumChannelId": "...",
      "notificationChannelId": null
    }
  },
  "agents": {
    "claude": {
      "command": "claude-agent-acp",
      "args": [],
      "workingDirectory": "~/projects",
      "env": {}
    },
    "codex": {
      "command": "codex",
      "args": ["--acp"],
      "workingDirectory": "~/projects",
      "env": {}
    }
  },
  "defaultAgent": "claude",
  "workspace": {
    "baseDir": "~/openacp-workspace"
  },
  "tunnel": {
    "provider": "cloudflare",
    "options": {}
  },
  "security": {
    "allowedUserIds": [],
    "maxConcurrentSessions": 5,
    "sessionTimeoutMinutes": 60,
    "authToken": "auto-generated-on-first-run"
  },
  "server": {
    "host": "127.0.0.1",
    "port": 3100
  },
  "stt": {
    "provider": "whisper",
    "options": {
      "apiKey": "",
      "model": "whisper-1",
      "language": "en"
    }
  },
  "sessions": {
    "retentionDays": 30,
    "persistenceEnabled": false
  }
}
```

## Sections

### `channels`

Key-value map where key = channel adapter name, value = channel-specific config.

Each channel adapter defines its own config schema. The core only requires:
- `enabled: boolean` — whether to start this adapter

All other fields are adapter-specific.

### `agents`

Key-value map where key = agent name (user-facing), value = agent config.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `command` | string | yes | Command to spawn the agent |
| `args` | string[] | no | Command arguments |
| `workingDirectory` | string | no | CWD for the agent subprocess |
| `env` | Record<string, string> | no | Extra environment variables |

### `defaultAgent`

The agent name used when user runs `/new` without specifying an agent.

### `workspace`

Workspace directory management.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `baseDir` | string | no | Base directory for named workspaces (default: "~/openacp-workspace") |

When user runs `/new agent my-app`, workspace resolves to `{baseDir}/my-app/` (lowercase).
When user provides absolute path (`/path/to/project` or `~/project`), it's used directly.

### `tunnel`

Tunnel configuration for exposing local services (file viewer, web UI).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `provider` | string | no | Tunnel provider: "cloudflare", "ngrok", "bore" |
| `options` | object | no | Provider-specific options |

### `security`

Access control and resource limits.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `allowedUserIds` | string[] | no | Whitelist of user IDs. Empty = all group members (default: []) |
| `maxConcurrentSessions` | number | no | Max active agent subprocesses (default: 5) |
| `sessionTimeoutMinutes` | number | no | Auto-cancel idle sessions (default: 60) |
| `authToken` | string | no | Token for tunnel/web UI auth (auto-generated on first run) |

### `server`

Internal HTTP server config (used by file viewer and web UI).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `host` | string | no | Bind address (default: "127.0.0.1") |
| `port` | number | no | Port (default: 3100) |

### `stt` (Phase 4)

Speech-to-text provider config for voice messages.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `provider` | string | no | STT provider: "whisper", "local-whisper", "google", "deepgram" |
| `options` | object | no | Provider-specific options (apiKey, model, language) |

### `sessions` (Phase 3)

Session persistence settings.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `retentionDays` | number | no | Auto-cleanup sessions older than N days (default: 30) |
| `persistenceEnabled` | boolean | no | Enable session save/resume (default: false) |

## Environment Variable Overrides

Sensitive values can be set via environment variables instead of the config file:

| Variable | Overrides |
|----------|-----------|
| `OPENACP_CONFIG_PATH` | Config file location |
| `OPENACP_TELEGRAM_BOT_TOKEN` | `channels.telegram.botToken` |
| `OPENACP_TELEGRAM_CHAT_ID` | `channels.telegram.chatId` |
| `OPENACP_DISCORD_BOT_TOKEN` | `channels.discord.botToken` |
| `OPENACP_DEFAULT_AGENT` | `defaultAgent` |

Environment variables take precedence over config file values.

## Validation

Config is validated on load using a schema validator (e.g., Zod). Invalid config rejects startup with a clear error message indicating which field is invalid.

## Hot Reload

ConfigManager watches the config file for changes. When the file is modified:
1. Re-validate the new config
2. If valid, apply changes (start/stop adapters as needed)
3. If invalid, log error and keep current config
