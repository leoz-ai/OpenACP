# Feature: CLI Tool

**Phase**: 2
**Package**: `packages/cli/`

## Overview

Command-line tool for managing OpenACP — configure channels/agents, start/stop the daemon, view sessions.

## Commands

```
openacp start                    # Start OpenACP daemon
openacp stop                     # Stop daemon
openacp status                   # Show daemon status + active sessions

openacp config show              # Print current config
openacp config set <key> <value> # Set config value
openacp config edit              # Open config in $EDITOR

openacp agents list              # List configured agents
openacp agents add <name>        # Add new agent interactively
openacp agents remove <name>     # Remove agent

openacp channels list            # List configured channels
openacp channels enable <name>   # Enable channel
openacp channels disable <name>  # Disable channel

openacp sessions list            # List active sessions
openacp sessions cancel <id>     # Cancel a session
```

## Implementation

- Built with a CLI framework (e.g., `commander`, `yargs`, or `citty`)
- Reads/writes the same JSON config file
- Communicates with running daemon via IPC (Unix socket or HTTP API)

## Daemon Communication

When `openacp start` runs, it starts the daemon process. CLI commands like `sessions list` communicate with the running daemon:

- Option A: Unix socket (NDJSON, like Telegram-ACP)
- Option B: HTTP API (same as Web UI API endpoints)

Recommendation: HTTP API — reuse the same endpoints as Web UI, simpler to implement.
