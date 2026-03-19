# Feature: Discord Channel Adapter

**Phase**: 2
**Package**: `packages/adapters/discord/`

## Overview

Discord adapter connects OpenACP to Discord. Uses Forum Channels — each ACP session is a forum post/thread.

## Dependencies

- `discord.js` — Discord API library
- `@openacp/core` — Core abstract classes

## Discord Setup Requirements

- Discord Bot created via Discord Developer Portal
- Bot added to a server (guild) with permissions: Manage Threads, Send Messages, Create Public Threads, Embed Links, Use External Emojis
- A Forum Channel created for sessions
- A Text Channel for notifications

## Architecture

```
Discord API (gateway WebSocket)
  │
  ▼
DiscordAdapter extends ChannelAdapter
  ├── Bot client (discord.js)
  ├── Forum post management
  ├── Message formatting
  └── Notification channel
```

## Topic Model

### Session Threads
- Each `/new` → bot creates a new Forum Post in the Forum Channel
- Post title initially: "New Session" or agent name
- After first AI response → auto-rename post based on AI summary
- All agent output in the forum thread (no @mention — silent)

### Notification Channel
- Dedicated text channel for all notifications
- Created manually by user, ID set in config (`notificationChannelId`)
- Notifications with @mention or ping enabled
- Content: summary + link to the forum post
- Events: session completed, session error, permission request (with link to approve in forum thread)

## Message Formatting

Discord supports Markdown natively — less conversion needed than Telegram.
- `**bold**`, `*italic*`, `` `code` `` work directly
- Code blocks with syntax highlighting: ` ```ts ... ``` `
- Message limit: 2000 characters
- Split at paragraph boundaries, never inside code blocks
- Long code blocks (> 1800 chars) → file attachment (.txt) or tunnel link (if tunnel enabled)

### Tool Call Display
```
🔧 read_file("src/main.ts")
⏳ Running...
✅ Completed (245 lines read)
```

Edit the original message as status changes (Discord supports message editing).

### Permission Request Display

Discord buttons (ActionRow + ButtonBuilder):
```
🔐 Agent requests permission:
Run command: npm install express
[✅ Allow]  [❌ Deny]
```

Inline buttons in the forum thread. User clicks → `core.handlePermissionResponse()`.

## Commands

Discord slash commands (registered via Discord API):

| Command | Description |
|---------|-------------|
| `/new` | Create new session with default agent |
| `/new <agent>` | Create new session with specific agent |
| `/cancel` | Cancel current session in this thread |
| `/status` | Show session status |
| `/agents` | List available agents |
| `/help` | Show help message |

## Config

```json
{
  "discord": {
    "enabled": true,
    "botToken": "...",
    "guildId": "123456789",
    "forumChannelId": "987654321",
    "notificationChannelId": "111222333"
  }
}
```

## Error Handling

- Bot disconnected → reconnect via discord.js auto-reconnect
- Forum post creation fails → send error in notification channel
- Message send fails → retry once, then log error
- Agent subprocess crash → notify in forum thread + notification channel
