# Feature: Agent Skills as Channel Commands

**Phase**: 3

## Overview

When an ACP agent connects, it may expose available skills/slash commands (e.g., `/commit`, `/review`, `/test`). OpenACP auto-discovers these and registers them as channel commands so users can invoke agent skills directly from chat.

## How It Works

### Discovery

1. After ACP handshake, query agent for available commands/skills
2. ACP protocol supports this via agent capabilities or custom methods
3. Parse the list: command name, description, arguments

### Registration

For each discovered skill:
1. Register as a channel command (Telegram bot command / Discord slash command)
2. Show in `/help` output
3. Available only within session topics (not in notification topic)

### Execution

```
User types /commit in session topic
  → ChannelAdapter recognizes it as agent skill
  → Forward to AgentInstance as a prompt: "/commit"
  → Agent handles it natively
  → Response streamed back to topic
```

### Dynamic Updates

- Skills list may change per agent type
- When switching agents or starting new sessions, commands update accordingly
- Channel-level commands (like `/new`, `/cancel`) always take precedence over agent skills

## UX

### Listing Skills
```
/skills

Available skills for claude:
  /commit  — Create a git commit
  /review  — Review code changes
  /test    — Run tests
  /init    — Initialize project
```

### Invoking Skills
```
/commit -m "fix: resolve login bug"
```

Agent receives this as a prompt and handles it natively.

## Considerations

- Not all agents expose skills in the same way — need to handle gracefully
- If agent doesn't expose skills, `/skills` returns empty list
- Agent skills should not conflict with core commands (`/new`, `/cancel`, `/status`, `/agents`, `/help`)
