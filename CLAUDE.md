# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

```bash
pnpm install            # Install dependencies
pnpm build              # TypeScript compile (tsc)
pnpm build:publish      # Bundle for npm publish (tsup → dist-publish/)
pnpm start              # Run: node dist/cli.js
pnpm dev                # Watch mode (tsc --watch)
pnpm test               # Run tests (vitest)
```

## Architecture

OpenACP bridges AI coding agents to messaging platforms via the Agent Client Protocol (ACP). The flow:

```
User (Telegram) → ChannelAdapter → OpenACPCore → Session → AgentInstance (ACP subprocess)
```

### Project Layout

```
src/
  cli.ts              — CLI entry (start, install, uninstall, plugins, --version, --help)
  main.ts             — Server startup, plugin boot
  index.ts            — Public API exports
  core/               — Core modules
    config/           — Zod-validated config, migrations, editor
    agents/           — Agent instance, catalog, installer, store
    sessions/         — Session, session-manager, session-bridge, permission-gate
    plugin/           — Plugin infrastructure (LifecycleManager, ServiceRegistry, MiddlewareChain, PluginContext)
    commands/         — System chat commands (session, agents, admin, help, menu)
    adapter-primitives/ — Shared adapter framework (MessagingAdapter, StreamAdapter, SendQueue, etc.)
    utils/            — Logger, typed-emitter, file utilities
    setup/            — First-run setup wizard
  plugins/            — All plugins (adapters + services)
    telegram/         — Telegram adapter (grammY)
    slack/            — Slack adapter (@slack/bolt)
    speech/           — TTS/STT (Edge TTS, Groq STT)
    tunnel/           — Port forwarding (Cloudflare, ngrok, Bore, Tailscale)
    security/         — Access control, rate limiting
    usage/            — Cost tracking, budget
    api-server/       — REST API + SSE
    file-service/     — File I/O for agents
    notifications/    — Cross-session alerts
    context/          — Conversation history
  cli/
    commands/         — CLI commands (start, plugins, dev, etc.)
    plugin-template/  — Scaffold templates for `openacp plugin create`
  packages/
    plugin-sdk/       — @openacp/plugin-sdk (types + testing utilities)
```

### Core Abstractions

**OpenACPCore** (`core.ts`) — Registers adapters, routes messages, creates sessions, wires agent events to adapters. Accesses services via ServiceRegistry.

**Session** (`session.ts`) — Wraps an AgentInstance with a prompt queue (serial processing), auto-naming, and lifecycle management.

**AgentInstance** (`agent-instance.ts`) — Spawns agent subprocess, implements full ACP Client interface. Converts ACP events to AgentEvent types.

**LifecycleManager** (`plugin/lifecycle-manager.ts`) — Boots plugins in dependency order (topo-sort), manages setup/teardown, handles version migration.

**ServiceRegistry** (`plugin/service-registry.ts`) — Central service discovery. Plugins register services, core accesses them via typed interfaces.

**CommandRegistry** (`command-registry.ts`) — Central command registry for chat commands. System and plugin commands registered here, adapters dispatch via generic handler.

**PluginContext** (`plugin/plugin-context.ts`) — Scoped API for plugins: events, services, middleware, commands, storage, logging.

### Plugin System

All features are plugins. Core only provides infrastructure (ServiceRegistry, MiddlewareChain, EventBus, LifecycleManager). Plugins register services, commands, and middleware in their `setup()` hook.

- 18 middleware hook points (message:incoming, agent:beforePrompt, permission:beforeRequest, etc.)
- 9 permission types (events:read, services:register, commands:register, etc.)
- Per-plugin settings via SettingsManager (~/.openacp/plugins/<name>/settings.json)

### Adapter Patterns

- **Forum topics** (Telegram): Each session gets its own topic
- **Callback routing**: Permission buttons use `p:` prefix, command buttons use `c/` prefix
- **Response renderers**: Adapters render CommandResponse types (text, menu, list, confirm, error, silent) per platform

## npm Publishing

Published as `@openacp/cli` on npm. Users install with `npm install -g @openacp/cli`.

- `pnpm build:publish` bundles CLI via tsup + builds SDK via tsc
- GitHub Action auto-publishes both `@openacp/cli` and `@openacp/plugin-sdk` on tag push (`v*`)
- Plugin system: `openacp plugin install <name>` installs from npm to `~/.openacp/plugins/`

## Versioning

Format: `YYYY.MDD.<patch>` — e.g. `2026.327.1` is the first patch on March 27, 2026.

- `YYYY` — year
- `MDD` — month + day (no leading zeros, since semver strips them). Jan 5 = `15`, Mar 27 = `327`, Dec 5 = `1205`
- `<patch>` — sequential patch number for that day, starting from 1

## Documentation Sync

When changing code, **you must update corresponding docs** to keep code and documentation in sync:

- **New features**: Must update README and `docs/` (GitBook) to describe the feature, usage, and config if applicable.
- **Feature updates**: Update related docs to reflect changes.
- **Bug fixes**: Update docs if the bug relates to documented behavior. Not required if docs are still accurate.
- **General rule**: Do not merge code without updating docs for new features or changes. README is for users, `docs/` is for both users and contributors.
- **Plugin Template Sync**: When changing plugin API, architecture, PluginContext, CommandDef, middleware hooks, permissions, or anything affecting how plugins are written → **must update plugin template** at `src/cli/plugin-template/` (especially `claude-md.ts` and `plugin-guide.ts`) so templates always reflect the current API. These templates are the primary reference for both AI agents and plugin developers.

## Conventions

- **English only**: All code, comments, commit messages, documentation, specs, plans, and any text in the repository must be written in English. No exceptions.
- ESM-only (`"type": "module"`), all imports use `.js` extension
- TypeScript strict mode, target ES2022, NodeNext module resolution

## Testing Conventions

### General Principles

- **Test framework**: Vitest. Test files live in `src/**/__tests__/*.test.ts` or `src/**/*.test.ts`.
- **Objective tests**: Tests must be objective — verify behavior against specifications and expected outcomes, not against current implementation details. The source code is for understanding, but tests should validate what the code *should* do.
- **Test flows, not internals**: Focus on testing user-facing flows and integration between components rather than individual private methods. Test the public API surface.
- **Edge cases matter**: Always test boundary conditions, error paths, and state machine transitions. These are where bugs hide.

### What to Test

1. **State machines**: Test ALL valid transitions AND all invalid transitions. Verify events emitted on each transition.
2. **Flow tests**: Test complete user flows end-to-end (e.g., message → session lookup → prompt → response → notification).
3. **Error recovery**: Test that errors don't leave the system in a broken state. After an error, the system should be usable again.
4. **Concurrency**: Test serial processing guarantees, queue ordering, lock behavior, and race conditions.
5. **Boundary values**: Test exact boundaries (e.g., `maxConcurrentSessions` at exactly the limit, budget at exactly the threshold).
6. **Cleanup**: Test that resources (timers, listeners, files) are cleaned up properly.
7. **Idempotency**: Test double-calls (double connect, double disconnect, double resolve) are safe.

### How to Write Tests

```typescript
// Use vi.fn() for mocks, TypedEmitter for event-based mocks
function mockAgentInstance() {
  const emitter = new TypedEmitter<{ agent_event: (event: AgentEvent) => void }>();
  return Object.assign(emitter, {
    sessionId: "agent-sess-1",
    prompt: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
    onPermissionRequest: vi.fn(),
  }) as any;
}
```

- **Mock at boundaries**: Mock AgentInstance, ChannelAdapter, SessionStore — not internal classes.
- **Use `vi.waitFor()`** for async assertions on fire-and-forget operations.
- **Use `vi.useFakeTimers()`** for timeout-based tests (e.g., PermissionGate timeout).
- **Cleanup in afterEach**: Always destroy stores, clear timers, remove temp files.
- **No sleep/polling**: Use `await Promise.resolve()` for microtask timing, `vi.waitFor()` for async ops.

### Test Organization

- `src/core/__tests__/` — Core module tests (session, bridge, queue, permissions, store, etc.)
- `src/__tests__/` — Integration tests and adapter-level tests
- `src/plugins/*/` — Plugin-specific unit tests
- Name files descriptively: `session-lifecycle.test.ts`, `session-bridge-autoapprove.test.ts`

## Backward Compatibility

Users who installed and ran older versions will have config, data, and storage in the old format. When adding or changing anything related, **you must ensure backward compatibility**:

- **Config** (`~/.openacp/config.json`): When adding new fields to Zod schema, always use `.default()` or `.optional()` so old configs don't fail validation. Never rename or remove fields without migration.
- **Storage / Data files** (`~/.openacp/`): When changing data format (sessions, topics, state...), must handle old format — read old data and auto-migrate to new format if needed. Must not crash on data from previous versions.
- **CLI flags & commands**: Do not remove or rename existing commands/flags. If deprecating, keep them working and log a warning.
- **Plugin API**: When changing interfaces that plugins use, must maintain backward compat or bump major version.
- **General rule**: New code must work with old data/config without requiring user action. If migration is needed, run it automatically on startup.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **OpenACP** (5987 symbols, 11457 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## When Debugging

1. `gitnexus_query({query: "<error or symptom>"})` — find execution flows related to the issue
2. `gitnexus_context({name: "<suspect function>"})` — see all callers, callees, and process participation
3. `READ gitnexus://repo/OpenACP/process/{processName}` — trace the full execution flow step by step
4. For regressions: `gitnexus_detect_changes({scope: "compare", base_ref: "main"})` — see what your branch changed

## When Refactoring

- **Renaming**: MUST use `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` first. Review the preview — graph edits are safe, text_search edits need manual review. Then run with `dry_run: false`.
- **Extracting/Splitting**: MUST run `gitnexus_context({name: "target"})` to see all incoming/outgoing refs, then `gitnexus_impact({target: "target", direction: "upstream"})` to find all external callers before moving code.
- After any refactor: run `gitnexus_detect_changes({scope: "all"})` to verify only expected files changed.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Tools Quick Reference

| Tool | When to use | Command |
|------|-------------|---------|
| `query` | Find code by concept | `gitnexus_query({query: "auth validation"})` |
| `context` | 360-degree view of one symbol | `gitnexus_context({name: "validateUser"})` |
| `impact` | Blast radius before editing | `gitnexus_impact({target: "X", direction: "upstream"})` |
| `detect_changes` | Pre-commit scope check | `gitnexus_detect_changes({scope: "staged"})` |
| `rename` | Safe multi-file rename | `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher` | Custom graph queries | `gitnexus_cypher({query: "MATCH ..."})` |

## Impact Risk Levels

| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK — direct callers/importers | MUST update these |
| d=2 | LIKELY AFFECTED — indirect deps | Should test |
| d=3 | MAY NEED TESTING — transitive | Test if critical path |

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/OpenACP/context` | Codebase overview, check index freshness |
| `gitnexus://repo/OpenACP/clusters` | All functional areas |
| `gitnexus://repo/OpenACP/processes` | All execution flows |
| `gitnexus://repo/OpenACP/process/{name}` | Step-by-step execution trace |

## Self-Check Before Finishing

Before completing any code modification task, verify:
1. `gitnexus_impact` was run for all modified symbols
2. No HIGH/CRITICAL risk warnings were ignored
3. `gitnexus_detect_changes()` confirms changes match expected scope
4. All d=1 (WILL BREAK) dependents were updated

## Keeping the Index Fresh

After committing code changes, the GitNexus index becomes stale. Re-run analyze to update it:

```bash
npx gitnexus analyze
```

If the index previously included embeddings, preserve them by adding `--embeddings`:

```bash
npx gitnexus analyze --embeddings
```

To check whether embeddings exist, inspect `.gitnexus/meta.json` — the `stats.embeddings` field shows the count (0 means no embeddings). **Running analyze without `--embeddings` will delete any previously generated embeddings.**

> Claude Code users: A PostToolUse hook handles this automatically after `git commit` and `git merge`.

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
