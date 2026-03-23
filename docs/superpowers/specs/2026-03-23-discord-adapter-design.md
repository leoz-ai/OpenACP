# Discord Adapter Design Spec

**Date:** 2026-03-23
**Status:** Approved

## Overview

Add a built-in Discord adapter to OpenACP with full feature parity with the Telegram adapter. Uses discord.js library and maps Telegram concepts (forum topics, inline keyboards, callback queries) to Discord equivalents (forum channel posts, button components, interactions).

## Architecture: Mirror Approach

Replicate the Telegram adapter's file structure 1:1 in `src/adapters/discord/`, mapping each Telegram concept to its Discord equivalent. No shared base class extraction — keep adapters independent.

## File Structure

```
src/adapters/discord/
  adapter.ts              — Main DiscordAdapter class
  index.ts                — Re-exports
  types.ts                — DiscordChannelConfig, DiscordPlatformData
  forums.ts               — Forum post/thread CRUD
  streaming.ts            — MessageDraft (2000 char limit)
  send-queue.ts           — DiscordSendQueue with rate limiting
  permissions.ts          — Button-based permission handler
  formatting.ts           — Markdown formatting for Discord
  activity.ts             — ThinkingIndicator, UsageMessage, PlanCard, ActivityTracker
  tool-call-tracker.ts    — Tool call state tracking
  draft-manager.ts        — DraftManager for streaming
  skill-command-manager.ts — Skill command pinning
  action-detect.ts        — Action detection + button building
  assistant.ts            — Assistant session in dedicated thread
  commands/
    index.ts              — Slash command registration
    menu.ts               — Menu interactions
    new-session.ts        — /new command flow
    session.ts            — /cancel, /status, /sessions
    admin.ts              — /dangerous, /restart, /update
    agents.ts             — /agents, /install
    integrate.ts          — /integrate
    settings.ts           — /settings
    doctor.ts             — /doctor
```

## Config

Added to `config.channels`:

```json
{
  "channels": {
    "discord": {
      "enabled": false,
      "botToken": "YOUR_DISCORD_BOT_TOKEN",
      "guildId": "",
      "forumChannelId": null,
      "notificationChannelId": null,
      "assistantThreadId": null
    }
  }
}
```

All fields use `.default()` or `.optional()` for backward compatibility.

**Type:**

```ts
interface DiscordChannelConfig {
  enabled: boolean
  botToken: string
  guildId: string
  forumChannelId: string | null
  notificationChannelId: string | null
  assistantThreadId: string | null
}
```

**Platform data** (stored in `SessionRecord.platform`):

```ts
interface DiscordPlatformData {
  threadId: string
  skillMsgId?: string
}
```

**Env overrides** (fallback for Docker/CI, not primary flow):
- `OPENACP_DISCORD_BOT_TOKEN` → `channels.discord.botToken`
- `OPENACP_DISCORD_GUILD_ID` → `channels.discord.guildId`

**Primary flow:** Token entered via interactive setup → saved to `config.json`.

## Platform Mapping

| Concern | Telegram | Discord |
|---|---|---|
| Message limit | 4096 chars | 2000 chars |
| Streaming | `editMessageText` | `message.edit()` |
| Buttons | InlineKeyboard + callback queries | ActionRow + ButtonBuilder + interactions |
| Interaction timeout | No timeout | 3s acknowledgment required |
| Thread model | Forum topics (integer `message_thread_id`) | Forum posts (string `threadId`) |
| Commands | `bot.command()` text commands | Slash commands (guild-registered) |
| Formatting | HTML (`<b>`, `<code>`) | Native Markdown (`**bold**`, `` `code` ``) |
| Rate limits | ~30 msg/sec per chat | 50 req/sec global, 5 msg/sec per channel |
| Bot setup | BotFather token | Token + Guild ID + Gateway Intents |
| Typing indicator | `sendChatAction('typing')` | `channel.sendTyping()` |

## Startup Sequence

`DiscordAdapter.start()`:

1. Create `Client` with intents: `Guilds`, `GuildMessages`, `MessageContent`, `GuildMessageReactions`
2. Instantiate `ToolCallTracker`, `DraftManager`, `SkillCommandManager`
3. `client.login(botToken)`
4. On `ready`:
   - Verify bot is in configured guild
   - `ensureForums()` — create Forum Channel + Notification Channel if `null`, persist IDs to config
   - Register slash commands to guild (`guild.commands.set()`)
   - Create `PermissionHandler`
   - Set up `interactionCreate` handler (slash commands + button routing)
   - Set up `messageCreate` handler (message routing)
   - Spawn assistant session
   - Send welcome message to notification channel

## Event Flow

### Message Routing (`messageCreate`)

```
User sends message in forum thread
  → guildId check (reject if wrong guild)
  → ignore bot messages
  → threadId = message.channelId
  → core.handleMessage({ channelId: 'discord', threadId, userId, text })
```

### Interaction Routing (`interactionCreate`)

```
Button clicked or slash command used
  → interaction.deferReply() or interaction.deferUpdate() (within 3s)
  → Route by type:
    - ChatInputCommand → slash command handlers
    - Button → customId prefix routing (p:, m:, d:, a:, ag:, na:)
```

### sendMessage() Dispatch

| Type | Discord Action |
|---|---|
| `text` | `DraftManager.append()` → `message.edit()` streaming → split at 2000 chars |
| `thought` | `ActivityTracker.onThought()` → `channel.sendTyping()` |
| `tool_call` | `DraftManager.finalize()` → `ToolCallTracker.trackNewCall()` → send embed |
| `tool_update` | `ToolCallTracker.updateCall()` → edit embed on terminal status |
| `plan` | `ActivityTracker.onPlan()` → embed with plan entries |
| `usage` | `DraftManager.finalize()` → usage embed → notification channel |
| `session_end` | `DraftManager.finalize()` → cleanup → "Done" message |
| `error` | `DraftManager.finalize()` → error embed |

### Permission Flow

```
AgentInstance.onPermissionRequest
  → session.permissionGate.setPending(request)
  → adapter.sendPermissionRequest()
    → Send message with ActionRow buttons (customId: "p:<key>:<optionId>")
  → User clicks button
  → interactionCreate handler matches "p:" prefix
    → interaction.deferUpdate()
    → session.permissionGate.resolve(optionId)
    → Edit message to remove buttons
  → Promise resolves → ACP subprocess continues
```

Auto-approve: `session.dangerousMode = true` or description contains `"openacp"`.

### Session Thread Lifecycle

1. `/new` slash command → `interaction.deferReply()`
2. Create forum post in `forumChannelId` → get thread
3. `core.handleNewSession()` → spawns agent
4. `session.threadId = thread.id`
5. Auto-name event → `thread.setName()`

## Integration Points

### config.ts

Add Discord default config to `channels` with all fields `.default()` or `.optional()`.

### setup.ts

Add Discord as a channel option:
1. "Which channels do you want to enable?" → Telegram, Discord, or both
2. If Discord: prompt for Bot Token, Guild ID
3. Save to config

### main.ts

Add built-in adapter lookup:

```ts
else if (channelName === 'discord') {
  adapter = new DiscordAdapter(core, channelConfig)
}
```

### package.json

Add `discord.js` dependency.

## Security

- **Guild restriction:** Only accept messages from configured `guildId`
- **User allowlist:** Uses existing `security.allowedUserIds` from core config
- **Ignore bot messages:** Skip all messages from bots (including self)

## Error Handling

| Scenario | Handling |
|---|---|
| Bot disconnected | discord.js auto-reconnects. Log warning. |
| Guild not found | `start()` throws: "Bot is not in guild {guildId}" |
| Forum channel deleted | Detect on send, recreate + log + update config |
| Rate limited | discord.js built-in rate limit queue. Drop queued text edits. |
| Message too long | Split at 2000 chars on `\n\n` boundaries, respect code blocks |
| Interaction expired | Already deferred. If followup fails, send new message. |
| Thread archived | `thread.setArchived(false)` before sending |

## Testing

Unit tests mock discord.js Client. Test each module independently.

```
tests/adapters/discord/
  streaming.test.ts
  send-queue.test.ts
  permissions.test.ts
  formatting.test.ts
  tool-call-tracker.test.ts
  adapter.test.ts
```

## Discord Bot Prerequisites

1. Create application at discord.com/developers
2. Add bot, enable MESSAGE CONTENT intent
3. Generate invite URL with scopes: `bot`, `applications.commands`
4. Bot permissions: Send Messages, Manage Threads, Create Public Threads, Read Message History, Use Slash Commands, Manage Channels, Embed Links
5. Invite to server, copy Guild ID
