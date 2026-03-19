# OpenACP — Roadmap

## Phase 1: Core + Telegram + ACP Agents

**Goal**: End-to-end working system — user messages via Telegram, AI agent responds.

- [ ] `packages/core/` — ChannelAdapter, AgentManager, SessionManager, ConfigManager, NotificationManager
- [ ] `packages/adapters/telegram/` — Telegram adapter (forum topics, notification topic, permission forwarding)
- [ ] Agent support: Claude Code (via `claude-agent-acp`) + Codex (via `codex --acp`)
- [ ] JSON config file for channels & agents
- [ ] Basic message formatting (Markdown → Telegram HTML)
- [ ] Message splitting for long responses
- [ ] Tool call status display (pending, in_progress, completed, failed)
- [ ] Permission request forwarding with inline buttons
- [ ] Auto-naming sessions via AI summarization

**Deliverable**: Self-hosted Telegram bot that can chat with Claude Code and Codex.

---

## Phase 2: Web UI + CLI + Discord

**Goal**: Management interfaces + second channel.

- [ ] `packages/web-ui/` — Web dashboard (config channels, agents, view session history)
- [ ] `packages/cli/` — CLI tool (manage config, start/stop daemon, view sessions)
- [ ] `packages/adapters/discord/` — Discord adapter (forum channels + threads)
- [ ] Tunnel service — Pluggable tunnel (Cloudflare Tunnel default) to expose local services
- [ ] File/Code viewer — Syntax-highlighted web viewer served via tunnel, clickable links in chat
- [ ] Basic code diff viewer for agent edits

**Deliverable**: Multi-channel support + management tools + code viewing.

---

## Phase 3: Skills as Commands + Advanced UX

**Goal**: Deeper agent integration + better user experience.

- [ ] Agent skills → Channel commands (auto-discover and register agent slash commands)
- [ ] Enhanced code diff view (inline diff rendering, side-by-side view via web viewer)
- [ ] Session persistence & resume (save/load session history)
- [ ] Session forking (branch a conversation via `/fork`)

**Deliverable**: Seamless agent skill usage from chat + persistent sessions.

---

## Phase 4: Voice + File Control

**Goal**: Multi-modal input support.

- [ ] Voice message → AI (speech-to-text → prompt to agent)
- [ ] File/image sharing (send files to agent for context)
- [ ] Multi-workspace support (multiple working directories per agent)

**Deliverable**: Control AI agents with voice and files.

---

## Phase 5: Ecosystem Expansion

**Goal**: Broaden platform and agent support.

- [ ] `packages/adapters/whatsapp/` — WhatsApp adapter
- [ ] Agent chaining (pipe output from agent A → input agent B)
- [ ] MCP server management via channel commands
- [ ] Plugin marketplace (community-built adapters & extensions)
- [ ] Non-ACP agent adapters (Gemini API, OpenAI API direct integration)

**Deliverable**: Full ecosystem with community extensions.
