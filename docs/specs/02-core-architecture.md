# OpenACP — Core Architecture

## Overview

The core package (`packages/core/`) is the central hub. It defines abstract interfaces, manages sessions, spawns agents, and routes messages between channels and agents.

## Core Types

```typescript
// Incoming message from channel to core
interface IncomingMessage {
  channelId: string
  threadId: string
  userId: string
  text: string
  attachments?: Attachment[]   // Phase 4: files, images
  voiceAudio?: Buffer          // Phase 4: voice messages
}

interface Attachment {
  type: 'file' | 'image'
  name: string
  url: string
  mimeType: string
}

// Outgoing message from core to channel
interface OutgoingMessage {
  type: 'text' | 'tool_call' | 'tool_update' | 'session_end' | 'error'
  text: string
  metadata?: Record<string, unknown>
}

// Permission request forwarded from agent
interface PermissionRequest {
  id: string
  description: string
  options: PermissionOption[]
}

interface PermissionOption {
  id: string
  label: string
  isAllow: boolean
}

// Notification sent to the notification topic/channel
interface NotificationMessage {
  sessionId: string
  sessionName?: string
  type: 'completed' | 'error' | 'permission' | 'input_required'
  summary: string
  deepLink?: string   // link to the specific message in session topic
}

// Agent events streamed from ACP agent
type AgentEvent =
  | { type: 'text'; content: string }
  | { type: 'tool_call'; id: string; name: string; args: string; status: ToolCallStatus }
  | { type: 'tool_update'; id: string; status: ToolCallStatus; output?: string }
  | { type: 'permission_request'; request: PermissionRequest }
  | { type: 'session_end'; reason: string }
  | { type: 'error'; message: string }

type ToolCallStatus = 'pending' | 'in_progress' | 'completed' | 'failed'

// Agent definition from config
interface AgentDefinition {
  name: string
  command: string
  args: string[]
  workingDirectory?: string
  env?: Record<string, string>
}

// Session ID: nanoid (URL-safe, used in tunnel URLs)
// Generated via nanoid(12) — e.g., "V1StGXR8_Z5j"
```

## Components

### 1. ChannelAdapter (Abstract Class)

The base class that all channel adapters must extend. Adapters receive platform events and call `core.handleMessage()` to forward them. Core calls adapter methods to send responses back.

```typescript
abstract class ChannelAdapter {
  constructor(protected core: OpenACPCore, protected config: ChannelConfig) {}

  // Lifecycle
  abstract start(): Promise<void>
  abstract stop(): Promise<void>

  // Outgoing: core → channel
  abstract sendMessage(sessionId: string, content: OutgoingMessage): Promise<void>
  abstract sendPermissionRequest(sessionId: string, request: PermissionRequest): Promise<void>
  abstract sendNotification(notification: NotificationMessage): Promise<void>

  // Session lifecycle on the channel side
  abstract createSessionThread(sessionId: string, name: string): Promise<string>  // returns threadId
  abstract renameSessionThread(sessionId: string, newName: string): Promise<void>
}
```

### 2. AgentManager

Manages available agents and their subprocess lifecycle.

**Responsibilities:**
- Load agent definitions from config
- Spawn ACP agent subprocesses (`child_process.spawn`)
- Initialize ACP connection via `@agentclientprotocol/sdk`
- Handle ACP handshake (capabilities exchange)
- Terminate agent processes on session end

**Interface:**
```typescript
class AgentManager {
  constructor(private config: AgentsConfig) {}

  getAvailableAgents(): AgentDefinition[]
  spawn(agentName: string, workingDirectory: string): Promise<AgentInstance>
  terminate(sessionId: string): Promise<void>
}
```

**AgentInstance** wraps the ACP SDK connection:
```typescript
interface AgentInstance {
  sessionId: string
  agentName: string
  onSessionUpdate: (event: AgentEvent) => void           // callback for streaming events
  onPermissionRequest: (req: PermissionRequest) => Promise<string>  // callback for permissions
  prompt(message: string): Promise<PromptResponse>        // blocking until turn completes
  cancel(): Promise<void>
  getSkills(): Promise<Skill[]>   // Phase 3
  destroy(): Promise<void>
}
```

### 3. SessionManager

Maps channel threads to ACP sessions.

**Responsibilities:**
- Create new sessions (channel thread + agent instance)
- Route messages from channel to correct agent
- Route agent events back to correct channel thread
- Track session state (initializing, active, cancelled, finished, error)
- Auto-name sessions after first prompt

**Interface:**
```typescript
class SessionManager {
  createSession(channelId: string, agentName: string, workingDirectory: string): Promise<Session>
  getSession(sessionId: string): Session | undefined
  getSessionByThread(channelId: string, threadId: string): Session | undefined
  cancelSession(sessionId: string): Promise<void>
  listSessions(channelId?: string): Session[]
}
```

**Session:**
```typescript
interface Session {
  id: string                  // nanoid(12), URL-safe
  channelId: string
  threadId: string
  agentName: string
  workingDirectory: string
  agentInstance: AgentInstance
  status: 'initializing' | 'active' | 'cancelled' | 'finished' | 'error'
  createdAt: Date
  name?: string  // auto-named after first prompt
}
```

### 4. ConfigManager

Loads, validates, and provides access to the JSON config file.

**Responsibilities:**
- Load config from file path (default: `~/.openacp/config.json`)
- Validate config schema
- Provide typed access to config sections
- Save config changes (for CLI/Web UI)
- Watch for config file changes (hot reload)

See [03-config.md](./03-config.md) for full config schema.

### 5. NotificationManager

Manages the notification topic/channel.

**Responsibilities:**
- Aggregate events from all sessions
- Format notification messages (summary + deep link)
- Route to the correct channel adapter's notification method
- Determine which events deserve notification:
  - Session completed
  - Session error
  - Permission request (with deep link to approve in session topic)
  - Agent requires user input

**Interface:**
```typescript
class NotificationManager {
  constructor(private adapters: Map<string, ChannelAdapter>) {}

  notify(channelId: string, notification: NotificationMessage): Promise<void>
  notifyAll(notification: NotificationMessage): Promise<void>
}

### 6. OpenACPCore (Orchestrator)

The main entry point that wires everything together.

```typescript
class OpenACPCore {
  configManager: ConfigManager
  agentManager: AgentManager
  sessionManager: SessionManager
  notificationManager: NotificationManager
  adapters: Map<string, ChannelAdapter>

  async start(): Promise<void>    // Load config, start all enabled adapters
  async stop(): Promise<void>     // Graceful shutdown
  registerAdapter(name: string, adapter: ChannelAdapter): void

  // Inbound: adapters call this to forward user messages to core
  async handleMessage(message: IncomingMessage): Promise<void>

  // Inbound: adapters call this to forward permission responses
  async handlePermissionResponse(sessionId: string, optionId: string): Promise<void>
}
```

## Data Flow

### User sends message

```
1. User types in channel topic/thread
2. ChannelAdapter receives platform event, calls core.handleMessage(incomingMessage)
3. SessionManager looks up session by channelId + threadId
4. If no session → error (user must /new first)
5. AgentInstance.prompt(message) → streams AgentEvents
6. For each AgentEvent:
   a. Text → adapter.sendMessage() (silent in topic)
            → notificationManager (if significant)
   b. ToolCall → adapter.sendMessage() (show status)
   c. PermissionRequest → adapter.sendPermissionRequest() (inline buttons in topic)
                        → notificationManager (summary + deep link)
   d. SessionEnd → adapter.sendMessage() (final status)
                 → notificationManager (completion notification)
```

### User creates new session

```
1. User types /new [agent-name] [working-directory] in channel
2. ChannelAdapter parses command, calls core.handleMessage()
3. Core resolves: agent (default if omitted), workingDirectory (agent default if omitted)
4. SessionManager.createSession(channelId, agentName, workingDirectory)
5. AgentManager.spawn(agentName, workingDirectory) → AgentInstance
6. adapter.createSessionThread(sessionId, "New Session") → threadId
7. Session is now active, waiting for first prompt
8. After first prompt response → AI generates session name
9. adapter.renameSessionThread(sessionId, generatedName)
```

## Security

### User Authorization

Since OpenACP is self-hosted, the trust boundary is the channel group/server itself:
- **Telegram**: Only users in the configured Supergroup can interact with the bot
- **Discord**: Only members of the configured guild/server

Additional controls via config:
```json
{
  "security": {
    "allowedUserIds": [],
    "maxConcurrentSessions": 5,
    "sessionTimeoutMinutes": 60
  }
}
```

- `allowedUserIds`: Whitelist of user IDs. Empty = all group members allowed.
- `maxConcurrentSessions`: Limit concurrent agent subprocesses (resource protection).
- `sessionTimeoutMinutes`: Auto-cancel idle sessions.

### Tunnel Security

Tunnel URLs expose local services publicly. Default protections:
- **Token auth**: Generated on startup, appended as query param or header. Stored in config.
- File viewer only serves files within configured `workingDirectory` paths (path traversal prevention).
- Read-only — no write endpoints on the file viewer.

### Web UI Security

- Default: token-based auth (same token as tunnel).
- Config API (`PUT /api/config`) requires auth.
- Bind to `127.0.0.1` by default (localhost only). External access only via tunnel with auth.

### Agent Subprocess Isolation

- Agents run with the same OS user as OpenACP (self-hosted assumption).
- `workingDirectory` constrains where the agent operates.
- Permission requests from agents are always forwarded to the user — core never auto-approves by default.

## Error Handling

- Agent subprocess crashes → Session status = 'error', notify user, offer to restart
- Channel API errors → Retry with backoff, log errors
- Config errors → Validate on load, reject invalid config with clear error messages
- ACP protocol errors → Log and surface to user in session topic

## Graceful Shutdown

When `stop()` is called:
1. Stop accepting new sessions
2. Send SIGTERM to all active agent subprocesses
3. Wait up to 10 seconds for agents to exit
4. Force SIGKILL remaining agents
5. Notify active sessions: "OpenACP is shutting down"
6. Close all channel adapter connections
7. Close HTTP server and tunnel
