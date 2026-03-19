# Phase 1 — ACP SDK Integration

## Overview

OpenACP acts as an ACP **client** connecting to ACP **agent** subprocesses. Uses `@agentclientprotocol/sdk` for all protocol communication.

## SDK Imports

```typescript
import {
  ClientSideConnection,
  ndJsonStream,
  type Client,
  type Agent,
  type SessionNotification,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type ReadTextFileRequest,
  type ReadTextFileResponse,
  type WriteTextFileRequest,
  type WriteTextFileResponse,
  type CreateTerminalRequest,
  type CreateTerminalResponse,
  type TerminalOutputRequest,
  type TerminalOutputResponse,
  type WaitForTerminalExitRequest,
  type WaitForTerminalExitResponse,
  type KillTerminalRequest,
  type ReleaseTerminalRequest,
  type PromptRequest,
  type PromptResponse,
} from '@agentclientprotocol/sdk'
```

## Stream Helpers

Convert Node.js streams to Web Streams required by SDK:

```typescript
function nodeToWebWritable(nodeStream: Writable): WritableStream<Uint8Array> {
  return new WritableStream<Uint8Array>({
    write(chunk) {
      return new Promise<void>((resolve, reject) => {
        nodeStream.write(Buffer.from(chunk), (err) => {
          if (err) reject(err)
          else resolve()
        })
      })
    },
  })
}

function nodeToWebReadable(nodeStream: Readable): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream.on('data', (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk))
      })
      nodeStream.on('end', () => controller.close())
      nodeStream.on('error', (err) => controller.error(err))
    },
  })
}
```

## AgentInstance Class

Wraps a single ACP agent subprocess + connection.

```typescript
class AgentInstance {
  private connection: ClientSideConnection
  private child: ChildProcess
  private stderrCapture: StderrCapture
  sessionId: string
  agentName: string

  // Callbacks — set by SessionManager when wiring events
  onSessionUpdate: (event: AgentEvent) => void
  onPermissionRequest: (request: PermissionRequest) => Promise<string>
}
```

### Spawn & Initialize

```typescript
static async spawn(agentDef: AgentDefinition, workingDirectory: string): Promise<AgentInstance> {
  // 1. Spawn subprocess
  const child = spawn(agentDef.command, agentDef.args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: workingDirectory,
    env: { ...process.env, ...agentDef.env },
    shell: true   // for env var expansion in command
  })

  // 2. Capture stderr for error reporting
  const stderrCapture = new StderrCapture(50)  // last 50 lines
  child.stderr!.on('data', (chunk) => stderrCapture.append(chunk.toString()))

  // 3. Create ACP stream
  // ndJsonStream(output: WritableStream, input: ReadableStream)
  // First arg = writable to agent stdin, second arg = readable from agent stdout
  const toAgent = nodeToWebWritable(child.stdin!)
  const fromAgent = nodeToWebReadable(child.stdout!)
  const stream = ndJsonStream(toAgent, fromAgent)

  // 4. Create instance (client implementation inside)
  const instance = new AgentInstance(child, stderrCapture)

  // 5. Create ClientSideConnection
  instance.connection = new ClientSideConnection(
    (agent: Agent) => instance.createClient(agent),
    stream
  )

  // 6. ACP handshake
  await instance.connection.initialize({
    protocolVersion: 1,
    clientCapabilities: {
      fs: { readTextFile: true, writeTextFile: true },
      terminal: true,
    },
  })

  // 7. Create session
  const { sessionId } = await instance.connection.newSession({
    cwd: workingDirectory,
    mcpServers: [],
  })
  instance.sessionId = sessionId

  return instance
}
```

### Client Implementation (ACP callbacks)

```typescript
private createClient(agent: Agent): Client {
  return {
    agent,

    // Receive streaming updates from agent
    sessionUpdate: async (params: SessionNotification) => {
      const event = this.convertSessionUpdate(params.update)
      if (event) {
        this.onSessionUpdate(event)
      }
    },

    // Agent asks for permission to execute tool
    requestPermission: async (params: RequestPermissionRequest): Promise<RequestPermissionResponse> => {
      const request: PermissionRequest = {
        id: params.toolCall.toolCallId,
        description: this.formatToolDescription(params.toolCall),
        options: params.options.map(opt => ({
          id: opt.optionId,
          label: opt.name,
          isAllow: opt.kind === 'allow_once' || opt.kind === 'allow_always',
        })),
      }

      const selectedOptionId = await this.onPermissionRequest(request)
      return { outcome: { outcome: 'selected', optionId: selectedOptionId } }
    },

    // File read — direct filesystem access
    readTextFile: async (params: ReadTextFileRequest): Promise<ReadTextFileResponse> => {
      const content = await fs.promises.readFile(params.path, 'utf-8')
      return { content }
    },

    // File write — direct filesystem access
    writeTextFile: async (params: WriteTextFileRequest): Promise<WriteTextFileResponse> => {
      await fs.promises.mkdir(path.dirname(params.path), { recursive: true })
      await fs.promises.writeFile(params.path, params.content)
      return {}
    },

    // Terminal operations — execute on local machine
    createTerminal: async (params: CreateTerminalRequest): Promise<CreateTerminalResponse> => {
      const terminalId = nanoid(8)
      const proc = spawn(params.command, params.args || [], {
        cwd: params.cwd,
        env: params.env
          ? { ...process.env, ...Object.fromEntries(params.env.map(e => [e.name, e.value])) }
          : process.env,
        shell: true,
      })
      const MAX_TERMINAL_OUTPUT = 1024 * 1024  // 1MB cap
      this.terminals.set(terminalId, { process: proc, output: '', exitStatus: null })

      proc.stdout?.on('data', (chunk) => {
        const t = this.terminals.get(terminalId)!
        if (t.output.length < MAX_TERMINAL_OUTPUT) {
          t.output += chunk.toString()
        }
      })
      proc.stderr?.on('data', (chunk) => {
        const t = this.terminals.get(terminalId)!
        if (t.output.length < MAX_TERMINAL_OUTPUT) {
          t.output += chunk.toString()
        }
      })
      proc.on('exit', (code, signal) => {
        this.terminals.get(terminalId)!.exitStatus = { exitCode: code, signal }
      })

      return { terminalId }
    },

    terminalOutput: async (params: TerminalOutputRequest) => {
      const t = this.terminals.get(params.terminalId)!
      return { output: t.output, truncated: false, exitStatus: t.exitStatus }
    },

    waitForTerminalExit: async (params: WaitForTerminalExitRequest) => {
      const t = this.terminals.get(params.terminalId)!
      if (t.exitStatus) return { exitStatus: t.exitStatus }
      return new Promise((resolve) => {
        t.process.on('exit', (code, signal) => {
          resolve({ exitStatus: { exitCode: code, signal } })
        })
      })
    },

    killTerminal: async (params: KillTerminalRequest) => {
      const t = this.terminals.get(params.terminalId)
      if (t) t.process.kill('SIGTERM')
      return {}
    },

    releaseTerminal: async (params: ReleaseTerminalRequest) => {
      const t = this.terminals.get(params.terminalId)
      if (t) {
        t.process.kill('SIGKILL')
        this.terminals.delete(params.terminalId)
      }
      return {}
    },
  }
}
```

### Convert SessionUpdate → AgentEvent

```typescript
private convertSessionUpdate(update: SessionUpdate): AgentEvent | null {
  switch (update.sessionUpdate) {
    // Note: SessionUpdate is a discriminated union where fields are at the TOP LEVEL
    // e.g., tool_call update has update.toolCallId, update.title, etc. (not update.toolCall.xxx)

    case 'agent_message_chunk':
      // ContentChunk: { content: ContentBlock, messageId?: string }
      if (update.content.type === 'text') {
        return { type: 'text', content: update.content.text }
      }
      return null

    case 'agent_thought_chunk':
      if (update.content.type === 'text') {
        return { type: 'thought', content: update.content.text }
      }
      return null

    case 'tool_call':
      // ToolCall fields at top level: toolCallId, title, kind, status, content, locations
      return {
        type: 'tool_call',
        id: update.toolCallId,
        name: update.title,
        kind: update.kind,
        status: update.status || 'pending',
        content: update.content,
        locations: update.locations,
      }

    case 'tool_call_update':
      // ToolCallUpdate fields at top level: toolCallId (required), title?, status?, content?, locations?
      return {
        type: 'tool_update',
        id: update.toolCallId,
        status: update.status,
        content: update.content,
        locations: update.locations,
      }

    case 'plan':
      return {
        type: 'plan',
        entries: update.entries.map(e => ({
          content: e.content,
          status: e.status,
          priority: e.priority,
        })),
      }

    case 'usage_update':
      return {
        type: 'usage',
        tokensUsed: update.used,
        contextSize: update.size,
        cost: update.cost,
      }

    case 'available_commands_update':
      return {
        type: 'commands_update',
        commands: update.availableCommands,
      }

    default:
      return null  // Ignore unknown update types
  }
}
```

### Prompt Method

```typescript
async prompt(text: string): Promise<PromptResponse> {
  return this.connection.prompt({
    sessionId: this.sessionId,
    prompt: [{ type: 'text', text }],
  })
  // While this awaits, sessionUpdate() callback fires for each event
}

async cancel(): Promise<void> {
  await this.connection.cancel({ sessionId: this.sessionId })
}

async destroy(): Promise<void> {
  // Cleanup terminals
  for (const [id, t] of this.terminals) {
    t.process.kill('SIGKILL')
  }
  this.terminals.clear()

  // Kill agent subprocess
  this.child.kill('SIGTERM')
  setTimeout(() => {
    if (!this.child.killed) this.child.kill('SIGKILL')
  }, 10_000)
}
```

## StderrCapture

```typescript
class StderrCapture {
  private lines: string[] = []
  constructor(private maxLines: number) {}

  append(chunk: string) {
    this.lines.push(...chunk.split('\n').filter(Boolean))
    if (this.lines.length > this.maxLines) {
      this.lines = this.lines.slice(-this.maxLines)
    }
  }

  getLastLines(): string {
    return this.lines.join('\n')
  }
}
```
