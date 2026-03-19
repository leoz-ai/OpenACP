# Feature: Web UI Dashboard

**Phase**: 2
**Package**: `packages/web-ui/`

## Overview

A web-based dashboard for configuring OpenACP, viewing sessions, and monitoring agent activity. Served locally and accessible via tunnel.

## Features

### Configuration Management
- Edit channels config (enable/disable, tokens, IDs)
- Edit agents config (add/remove agents, set commands, working directories)
- Set default agent
- Configure tunnel provider
- All changes write to the JSON config file

### Session Monitor
- List all active/recent sessions
- View session details: agent, channel, status, created time
- View conversation history per session
- Cancel active sessions

### Agent Status
- List configured agents
- Show which agents are currently running
- Show available skills per agent

### Dashboard
- Overview: active sessions count, agents status, channels status
- Recent activity feed

## Tech Stack

Options (to be decided in implementation):
- **Simple**: Express + static HTML/JS (minimal dependencies)
- **Modern**: React/Next.js or Vue (better UX but heavier)

Recommendation: Start simple with Express + vanilla HTML/JS, upgrade if needed.

## Access

- Local: `http://localhost:3100`
- Remote (via tunnel): `https://{tunnel-url}/`
- Optional auth: basic auth or token from config

## API Endpoints

```
GET  /api/config           → Read current config
PUT  /api/config           → Update config
GET  /api/sessions         → List sessions
GET  /api/sessions/:id     → Session details
POST /api/sessions/:id/cancel → Cancel session
GET  /api/agents           → List agents + status
GET  /api/channels         → List channels + status
```

## Config

No additional config needed — uses `server.host` and `server.port` from main config.
