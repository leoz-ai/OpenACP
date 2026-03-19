# OpenACP — Product Overview

## Vision

OpenACP is a self-hosted bridge that lets users interact with any ACP-compatible AI coding agent (Claude Code, Codex, etc.) from any messaging platform (Telegram, Discord, WhatsApp, etc.).

**One message, any channel, any agent.**

## Core Concepts

### Channel
A messaging platform adapter (Telegram, Discord, WhatsApp...). Each channel implements the `ChannelAdapter` abstract class and can be plugged into the core system.

### Agent
An AI coding agent that speaks the ACP (Agent Client Protocol). Agents are spawned as subprocesses and communicate via JSON-RPC over stdio.

### Session
A single conversation between a user and an agent. Each session maps to a topic/thread on the channel. Sessions can run in parallel.

### Notification Topic
A dedicated topic/thread on the channel that aggregates notifications from all sessions. Contains summaries + deep links to the original session topics.

## Architecture

```
User (Telegram / Discord / ...)
  │
  ▼
ChannelAdapter (plugin)
  │
  ▼
┌─────────────────────────────┐
│         OpenACP Core        │
│                             │
│  SessionManager             │
│  AgentManager               │
│  ConfigManager              │
│  NotificationManager        │
└─────────────────────────────┘
  │
  ▼
ACP SDK (@agentclientprotocol/sdk)
  │
  ▼
AI Agent subprocess (stdio JSON-RPC)
```

## Tech Stack

- **Language**: TypeScript
- **Runtime**: Node.js
- **ACP SDK**: `@agentclientprotocol/sdk` (official)
- **Monorepo**: pnpm workspace
- **Config**: JSON file

## Project Structure

```
openacp/
  packages/
    core/                  → Abstract classes, managers, shared types
    adapters/
      telegram/            → Telegram channel adapter
      discord/             → Discord channel adapter (Phase 2)
      whatsapp/            → WhatsApp channel adapter (Phase 5)
    agents/
      claude/              → Claude Code agent config/wrapper
      codex/               → Codex agent config/wrapper
    cli/                   → CLI tool for config & management
    web-ui/                → Web dashboard (Phase 2)
```

## Roadmap

See [01-roadmap.md](./01-roadmap.md) for the full phased roadmap.

## Spec Documents

| Document | Description |
|----------|-------------|
| [00-overview.md](./00-overview.md) | This document — product overview |
| [01-roadmap.md](./01-roadmap.md) | Phased roadmap |
| [02-core-architecture.md](./02-core-architecture.md) | Core system design |
| [03-config.md](./03-config.md) | Configuration system |
| [features/telegram-adapter.md](./features/telegram-adapter.md) | Telegram channel adapter |
| [features/discord-adapter.md](./features/discord-adapter.md) | Discord channel adapter |
| [features/tunnel-service.md](./features/tunnel-service.md) | Tunnel & file viewer |
| [features/skills-as-commands.md](./features/skills-as-commands.md) | Agent skills → channel commands |
| [features/voice-control.md](./features/voice-control.md) | Voice message control |
| [features/web-ui.md](./features/web-ui.md) | Web dashboard |
| [features/cli.md](./features/cli.md) | CLI tool |
| [features/session-persistence.md](./features/session-persistence.md) | Session persistence & resume |
