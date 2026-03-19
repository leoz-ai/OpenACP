# Feature: Telegram Channel Adapter

**Phase**: 1
**Package**: `packages/adapters/telegram/`

## Overview

Telegram adapter connects OpenACP to Telegram via the Bot API. Uses Supergroup with Forum/Topics enabled — each ACP session is a topic.

## Dependencies

- `grammy` or `telegraf` — Telegram Bot API library
- `@openacp/core` — Core abstract classes

## Telegram Setup Requirements

- Telegram Bot created via @BotFather
- Bot added to a Supergroup with Forum/Topics enabled
- Bot has admin permissions (create topics, send messages, pin messages)

## Architecture

```
Telegram API (polling / webhook)
  │
  ▼
TelegramAdapter extends ChannelAdapter
  ├── Bot instance (grammy/telegraf)
  ├── Topic management
  ├── Message formatting
  └── Notification topic
```

## Topic Model

### Session Topics
- Each `/new` command → bot creates a new Forum Topic
- Topic name initially: "New Session" or agent name
- After first AI response → auto-rename topic based on AI summary
- All agent output displayed in the session topic (silent — no notification)

### Notification Topic
- One dedicated topic for all notifications
- Created on first boot if not exists, ID saved in config (`notificationTopicId`)
- All notifications sent here WITH notification enabled
- Content: summary + deep link to the session topic message
- Events that trigger notifications:
  - Session completed
  - Session error
  - Permission request (summary + deep link to approve in session topic)
  - Agent requires user input

## Message Formatting

### Markdown → Telegram HTML
Agent responses are Markdown. Telegram supports limited HTML:
- `**bold**` → `<b>bold</b>`
- `` `code` `` → `<code>code</code>`
- Code blocks → `<pre><code class="language-X">...</code></pre>`
- Links → `<a href="...">text</a>`

### Message Splitting
Telegram limit: 4096 characters per message.
- Split at paragraph boundaries when possible
- Never split inside code blocks
- If a single code block exceeds limit → use Telegraph page (external link)

### Tool Call Display
```
🔧 read_file("src/main.ts")
⏳ Running...
✅ Completed (245 lines read)
```

Update the same message as status changes (edit message, not send new).

### Permission Request Display
```
🔐 Agent requests permission:

Run command: npm install express

[✅ Allow]  [❌ Deny]
```

Inline keyboard buttons. User taps → response forwarded to agent.

## Commands

| Command | Description |
|---------|-------------|
| `/new` | Create new session with default agent |
| `/new <agent>` | Create new session with specific agent |
| `/cancel` | Cancel current session in this topic |
| `/status` | Show session status |
| `/agents` | List available agents |
| `/help` | Show help message |
| `/skills` | List agent skills (Phase 3) |
| `/fork` | Fork current session (Phase 3) |

## Config

```json
{
  "telegram": {
    "enabled": true,
    "botToken": "123456:ABC-DEF...",
    "chatId": -1001234567890,
    "notificationTopicId": null
  }
}
```

## Error Handling

- Bot disconnected → retry with exponential backoff
- Topic creation fails → send error in general chat, suggest checking permissions
- Message send fails → retry once, then log error
- Agent subprocess crash → notify in session topic + notification topic
