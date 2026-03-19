# Phase 1 — Detailed Overview

## Goal

End-to-end working system: user messages via Telegram, AI agent responds through ACP protocol.

## Deliverable

Self-hosted Telegram bot that can chat with Claude Code and Codex coding agents.

## Scope

### In Scope
- Core package with abstract ChannelAdapter, AgentManager, SessionManager, ConfigManager, NotificationManager
- Telegram adapter (grammy) with forum topics, notification topic, assistant topic
- ACP SDK integration (ClientSideConnection, spawn agent subprocess, stdio JSON-RPC)
- Agent support: Claude Code (via claude-agent-acp) + Codex (via codex --acp)
- JSON config file in ~/.openacp/config.json
- Workspace management (baseDir + named workspaces)
- Message streaming (sendMessageDraft pattern with throttling)
- Tool call status display (pending, in_progress, completed, failed)
- Permission request forwarding with inline buttons
- Auto-naming sessions via AI summarization
- Prompt queue (queued prompts when agent is busy)
- Assistant topic (AI-powered help & session creation)
- Notification topic (aggregated notifications + deep links)
- Graceful shutdown

### Out of Scope (Later Phases)
- Discord/WhatsApp adapters
- CLI tool / Web UI
- Tunnel service / File viewer
- Session persistence
- Voice messages / File sharing
- Non-ACP agents

## Tech Stack

- **Language**: TypeScript
- **Runtime**: Node.js
- **Monorepo**: pnpm workspace
- **ACP SDK**: @agentclientprotocol/sdk
- **Telegram**: grammy
- **Validation**: Zod
- **ID generation**: nanoid

## Spec Documents

| Document | Description |
|----------|-------------|
| [01-project-structure.md](./01-project-structure.md) | Monorepo setup, packages, entry point |
| [02-acp-integration.md](./02-acp-integration.md) | ACP SDK client-side integration |
| [03-core-modules.md](./03-core-modules.md) | Core classes and session lifecycle |
| [04-telegram-adapter.md](./04-telegram-adapter.md) | Telegram bot, topics, formatting, commands |
| [05-startup-and-errors.md](./05-startup-and-errors.md) | Boot sequence, error handling, shutdown |
