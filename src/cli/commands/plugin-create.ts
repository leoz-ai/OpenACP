import * as p from '@clack/prompts'
import fs from 'node:fs'
import path from 'node:path'
import { getCurrentVersion } from '../version.js'

export async function cmdPluginCreate(): Promise<void> {
  p.intro('Create a new OpenACP plugin')

  const result = await p.group(
    {
      name: () =>
        p.text({
          message: 'Plugin name (e.g., @myorg/adapter-matrix)',
          placeholder: '@myorg/my-plugin',
          validate: (value: string | undefined) => {
            if (!value || !value.trim()) return 'Plugin name is required'
            if (!/^(@[a-z0-9-]+\/)?[a-z0-9-]+$/.test(value.trim())) {
              return 'Must be a valid npm package name (lowercase, hyphens, optional @scope/)'
            }
            return undefined
          },
        }),
      description: () =>
        p.text({
          message: 'Description',
          placeholder: 'A short description of your plugin',
        }),
      author: () =>
        p.text({
          message: 'Author',
          placeholder: 'Your Name <email@example.com>',
        }),
      license: () =>
        p.select({
          message: 'License',
          options: [
            { value: 'MIT', label: 'MIT' },
            { value: 'Apache-2.0', label: 'Apache 2.0' },
            { value: 'ISC', label: 'ISC' },
            { value: 'UNLICENSED', label: 'Unlicensed (private)' },
          ],
        }),
    },
    {
      onCancel: () => {
        p.cancel('Plugin creation cancelled.')
        process.exit(0)
      },
    },
  )

  const pluginName = result.name.trim()
  const dirName = pluginName.replace(/^@[^/]+\//, '') // strip scope for directory name
  const targetDir = path.resolve(process.cwd(), dirName)

  if (fs.existsSync(targetDir)) {
    p.cancel(`Directory "${dirName}" already exists.`)
    process.exit(1)
  }

  const spinner = p.spinner()
  spinner.start('Scaffolding plugin...')

  // Create directory structure
  fs.mkdirSync(path.join(targetDir, 'src', '__tests__'), { recursive: true })

  // Detect CLI version for dependency pinning
  const cliVersion = getCurrentVersion()

  // package.json
  const packageJson = {
    name: pluginName,
    version: '0.1.0',
    description: result.description || '',
    type: 'module',
    main: 'dist/index.js',
    types: 'dist/index.d.ts',
    scripts: {
      build: 'tsc',
      dev: 'tsc --watch',
      test: 'vitest',
      prepublishOnly: 'npm run build',
    },
    author: result.author || '',
    license: result.license as string,
    keywords: ['openacp', 'openacp-plugin'],
    engines: {
      openacp: `>=${cliVersion}`,
    },
    peerDependencies: {
      '@openacp/cli': `>=${cliVersion}`,
    },
    devDependencies: {
      '@openacp/plugin-sdk': cliVersion,
      typescript: '^5.4.0',
      vitest: '^3.0.0',
    },
  }
  fs.writeFileSync(
    path.join(targetDir, 'package.json'),
    JSON.stringify(packageJson, null, 2) + '\n',
  )

  // tsconfig.json
  const tsconfig = {
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      declaration: true,
      outDir: 'dist',
      rootDir: 'src',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
    },
    include: ['src'],
    exclude: ['node_modules', 'dist', 'src/**/__tests__'],
  }
  fs.writeFileSync(
    path.join(targetDir, 'tsconfig.json'),
    JSON.stringify(tsconfig, null, 2) + '\n',
  )

  // .gitignore
  fs.writeFileSync(
    path.join(targetDir, '.gitignore'),
    ['node_modules/', 'dist/', '*.tsbuildinfo', '.DS_Store', ''].join('\n'),
  )

  // .npmignore
  fs.writeFileSync(
    path.join(targetDir, '.npmignore'),
    ['src/', 'tsconfig.json', '.editorconfig', '.gitignore', '*.test.ts', '__tests__/', ''].join('\n'),
  )

  // .editorconfig
  fs.writeFileSync(
    path.join(targetDir, '.editorconfig'),
    [
      'root = true',
      '',
      '[*]',
      'indent_style = space',
      'indent_size = 2',
      'end_of_line = lf',
      'charset = utf-8',
      'trim_trailing_whitespace = true',
      'insert_final_newline = true',
      '',
    ].join('\n'),
  )

  // README.md
  fs.writeFileSync(
    path.join(targetDir, 'README.md'),
    [
      `# ${pluginName}`,
      '',
      result.description || 'An OpenACP plugin.',
      '',
      '## Installation',
      '',
      '```bash',
      `openacp plugin add ${pluginName}`,
      '```',
      '',
      '## Development',
      '',
      '```bash',
      'npm install',
      'npm run build',
      'npm test',
      '',
      '# Live development with hot-reload:',
      `openacp dev .`,
      '```',
      '',
      '## License',
      '',
      result.license as string,
      '',
    ].join('\n'),
  )

  // src/index.ts — full plugin template with all hooks
  const pluginVarName = dirName.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
  fs.writeFileSync(
    path.join(targetDir, 'src', 'index.ts'),
    `import type { OpenACPPlugin, PluginContext, InstallContext, MigrateContext } from '@openacp/plugin-sdk'

const plugin: OpenACPPlugin = {
  name: '${pluginName}',
  version: '0.1.0',
  description: '${(result.description || '').replace(/'/g, "\\'")}',

  // Declare which permissions your plugin needs.
  // Available: events:read, events:emit, services:register, services:use,
  //            middleware:register, commands:register, storage:read, storage:write, kernel:access
  permissions: ['events:read', 'services:register'],

  // Dependencies on other plugins (loaded before this one).
  // pluginDependencies: { '@openacp/security': '>=1.0.0' },

  // Optional dependencies (used if available, gracefully degrade if not).
  // optionalPluginDependencies: { '@openacp/usage': '>=1.0.0' },

  /**
   * Called during server startup in dependency order.
   * Register services, middleware, commands, and event listeners here.
   */
  async setup(ctx: PluginContext): Promise<void> {
    ctx.log.info('Plugin setup started')

    // Example: register a service
    // ctx.registerService('my-service', myServiceImpl)

    // Example: listen to events
    // ctx.on('session:created', (event) => { ... })

    // Example: register a slash command
    // ctx.registerCommand({
    //   name: 'mycommand',
    //   description: 'Does something useful',
    //   category: 'plugin',
    //   async handler(args) {
    //     return { type: 'text', text: 'Hello from ${pluginName}!' }
    //   },
    // })

    ctx.log.info('Plugin setup complete')
  },

  /**
   * Called during server shutdown in reverse dependency order.
   * Clean up resources, close connections, stop timers here.
   * Has a 10-second timeout.
   */
  async teardown(): Promise<void> {
    // Clean up resources here
  },

  /**
   * Called when user runs \`openacp plugin add ${pluginName}\`.
   * Use ctx.terminal for interactive prompts to gather configuration.
   */
  async install(ctx: InstallContext): Promise<void> {
    ctx.terminal.log.info('Installing ${pluginName}...')

    // Example: prompt for configuration
    // const apiKey = await ctx.terminal.text({
    //   message: 'Enter your API key',
    //   validate: (v) => v.length === 0 ? 'Required' : undefined,
    // })
    // await ctx.settings.set('apiKey', apiKey)

    ctx.terminal.log.success('Installation complete!')
  },

  /**
   * Called when user runs \`openacp plugin configure ${pluginName}\`.
   * Re-run configuration prompts to update settings.
   */
  async configure(ctx: InstallContext): Promise<void> {
    ctx.terminal.log.info('Configuring ${pluginName}...')

    // Re-run configuration prompts, pre-filling with current values
    // const current = await ctx.settings.getAll()
    // ...

    ctx.terminal.log.success('Configuration updated!')
  },

  /**
   * Called during boot when the plugin version has changed.
   * Migrate settings from the old format to the new format.
   */
  async migrate(ctx: MigrateContext, oldSettings: unknown, oldVersion: string): Promise<unknown> {
    ctx.log.info(\`Migrating from v\${oldVersion}\`)
    // Return the migrated settings object
    return oldSettings
  },

  /**
   * Called when user runs \`openacp plugin remove ${pluginName}\`.
   * Clean up any external resources. If opts.purge is true, delete all data.
   */
  async uninstall(ctx: InstallContext, opts: { purge: boolean }): Promise<void> {
    ctx.terminal.log.info('Uninstalling ${pluginName}...')
    if (opts.purge) {
      await ctx.settings.clear()
    }
    ctx.terminal.log.success('Uninstalled!')
  },
}

export default plugin
`,
  )

  // CLAUDE.md — AI agent context file
  fs.writeFileSync(
    path.join(targetDir, 'CLAUDE.md'),
    `# CLAUDE.md

This file provides context for AI coding agents (Claude, Cursor, etc.) working on this plugin.

## Project Overview

This is an OpenACP plugin. OpenACP bridges AI coding agents to messaging platforms via the Agent Client Protocol (ACP). Plugins extend OpenACP with new adapters, services, commands, and middleware.

- **Package**: ${pluginName}
- **SDK**: \`@openacp/plugin-sdk\` (types, base classes, testing utilities)
- **Entry point**: \`src/index.ts\` (default export of \`OpenACPPlugin\` object)

## Build & Run

\`\`\`bash
npm install           # Install dependencies
npm run build         # Compile TypeScript (tsc)
npm run dev           # Watch mode (tsc --watch)
npm test              # Run tests (vitest)
\`\`\`

### Development with hot-reload

\`\`\`bash
openacp dev .         # Compiles, watches, and reloads plugin on changes
\`\`\`

## File Structure

\`\`\`
src/
  index.ts              — Plugin entry point (exports OpenACPPlugin)
  __tests__/
    index.test.ts       — Tests using @openacp/plugin-sdk/testing
package.json            — engines.openacp declares minimum CLI version
tsconfig.json           — ES2022, NodeNext, strict mode
CLAUDE.md               — This file (AI agent context)
PLUGIN_GUIDE.md         — Human-readable developer guide
\`\`\`

## Architecture: How OpenACP Plugins Work

### Plugin Lifecycle

\`\`\`
install ──> [reboot] ──> migrate? ──> setup ──> [running] ──> teardown ──> uninstall
\`\`\`

| Hook | Trigger | Interactive? | Has Services? |
|------|---------|-------------|---------------|
| \`install(ctx)\` | \`openacp plugin add <name>\` | Yes | No |
| \`migrate(ctx, oldSettings, oldVersion)\` | Boot — stored version differs from plugin version | No | No |
| \`configure(ctx)\` | \`openacp plugin configure <name>\` | Yes | No |
| \`setup(ctx)\` | Every boot, after migrate | No | Yes |
| \`teardown()\` | Shutdown (10s timeout) | No | Yes |
| \`uninstall(ctx, opts)\` | \`openacp plugin remove <name>\` | Yes | No |

### OpenACPPlugin Interface

\`\`\`typescript
interface OpenACPPlugin {
  name: string                    // unique identifier, e.g. '@myorg/my-plugin'
  version: string                 // semver
  description?: string
  permissions?: PluginPermission[]
  pluginDependencies?: Record<string, string>          // name -> semver range
  optionalPluginDependencies?: Record<string, string>  // used if available
  overrides?: string              // replace a built-in plugin entirely
  settingsSchema?: ZodSchema      // Zod validation for settings
  essential?: boolean             // true = needs setup before system can run

  setup(ctx: PluginContext): Promise<void>
  teardown?(): Promise<void>
  install?(ctx: InstallContext): Promise<void>
  configure?(ctx: InstallContext): Promise<void>
  migrate?(ctx: MigrateContext, oldSettings: unknown, oldVersion: string): Promise<unknown>
  uninstall?(ctx: InstallContext, opts: { purge: boolean }): Promise<void>
}
\`\`\`

### PluginContext API (available in setup)

\`\`\`typescript
interface PluginContext {
  pluginName: string
  pluginConfig: Record<string, unknown>   // from settings.json

  // Events (requires 'events:read' / 'events:emit')
  on(event: string, handler: (...args: unknown[]) => void): void
  off(event: string, handler: (...args: unknown[]) => void): void
  emit(event: string, payload: unknown): void

  // Services (requires 'services:register' / 'services:use')
  registerService<T>(name: string, implementation: T): void
  getService<T>(name: string): T | undefined

  // Middleware (requires 'middleware:register')
  registerMiddleware<H extends MiddlewareHook>(hook: H, opts: MiddlewareOptions<MiddlewarePayloadMap[H]>): void

  // Commands (requires 'commands:register')
  registerCommand(def: CommandDef): void

  // Storage (requires 'storage:read' / 'storage:write')
  storage: PluginStorage  // get, set, delete, list, getDataDir

  // Messaging (requires 'services:use')
  sendMessage(sessionId: string, content: OutgoingMessage): Promise<void>

  // Kernel access (requires 'kernel:access')
  sessions: SessionManager
  config: ConfigManager
  eventBus: EventBus

  // Always available
  log: Logger  // trace, debug, info, warn, error, fatal, child
}
\`\`\`

### CommandDef and CommandResponse

\`\`\`typescript
interface CommandDef {
  name: string              // command name without slash
  description: string       // shown in /help
  usage?: string            // e.g. '<city>' or 'on|off'
  category: 'system' | 'plugin'
  handler(args: CommandArgs): Promise<CommandResponse | void>
}

interface CommandArgs {
  raw: string               // text after command name
  sessionId: string | null
  channelId: string         // 'telegram', 'discord', 'slack'
  userId: string
  reply(content: string | CommandResponse): Promise<void>
}

type CommandResponse =
  | { type: 'text'; text: string }
  | { type: 'menu'; title: string; options: MenuOption[] }
  | { type: 'list'; title: string; items: ListItem[] }
  | { type: 'confirm'; question: string; onYes: string; onNo: string }
  | { type: 'error'; message: string }
  | { type: 'silent' }
\`\`\`

### Settings System

- \`settingsSchema\`: Zod schema for validation
- \`SettingsAPI\` (in InstallContext): get, set, getAll, setAll, delete, clear, has
- Settings stored at \`~/.openacp/plugins/@scope/name/settings.json\`
- \`PluginStorage\` (in PluginContext): key-value store at \`~/.openacp/plugins/data/@scope/name/kv.json\`
- \`storage.getDataDir()\`: returns path for large files, databases, caches

### InstallContext (for install/configure/uninstall)

\`\`\`typescript
interface InstallContext {
  pluginName: string
  terminal: TerminalIO        // text, select, confirm, password, multiselect, log, spinner, note
  settings: SettingsAPI
  legacyConfig?: Record<string, unknown>
  dataDir: string
  log: Logger
}
\`\`\`

### Service Interfaces (available via ctx.getService)

| Service name | Interface | Description |
|---|---|---|
| \`security\` | \`SecurityService\` | Access control, session limits, user roles |
| \`file-service\` | \`FileServiceInterface\` | File saving, resolving, format conversion |
| \`notifications\` | \`NotificationService\` | Send notifications to users |
| \`usage\` | \`UsageService\` | Token/cost tracking and budget checking |
| \`speech\` | \`SpeechServiceInterface\` | Text-to-speech and speech-to-text |
| \`tunnel\` | \`TunnelServiceInterface\` | Port tunneling and public URL management |
| \`context\` | \`ContextService\` | Context building for agent sessions |

## Plugin Permissions

Declare in \`permissions\` array. Only request what you need.

| Permission | Allows |
|---|---|
| \`events:read\` | \`ctx.on()\` — subscribe to events |
| \`events:emit\` | \`ctx.emit()\` — emit custom events (must prefix with plugin name) |
| \`services:register\` | \`ctx.registerService()\` — provide services to other plugins |
| \`services:use\` | \`ctx.getService()\`, \`ctx.sendMessage()\` — consume services |
| \`middleware:register\` | \`ctx.registerMiddleware()\` — intercept and modify flows |
| \`commands:register\` | \`ctx.registerCommand()\` — add chat commands |
| \`storage:read\` | \`ctx.storage.get()\`, \`ctx.storage.list()\` |
| \`storage:write\` | \`ctx.storage.set()\`, \`ctx.storage.delete()\` |
| \`kernel:access\` | \`ctx.sessions\`, \`ctx.config\`, \`ctx.eventBus\`, \`ctx.core\` |

Calling a method without the required permission throws \`PluginPermissionError\`.

## Middleware Hooks (18 total)

Register with \`ctx.registerMiddleware(hook, { priority?, handler })\`. Return \`null\` to block the flow, call \`next()\` to continue.

### Message flow
- \`message:incoming\` — incoming user message (channelId, threadId, userId, text, attachments)
- \`message:outgoing\` — outgoing message to user (sessionId, message)

### Agent flow
- \`agent:beforePrompt\` — before prompt is sent to agent (sessionId, text, attachments)
- \`agent:beforeEvent\` — before agent event is processed (sessionId, event)
- \`agent:afterEvent\` — after agent event, before delivery (sessionId, event, outgoingMessage)

### Turn lifecycle
- \`turn:start\` — agent turn begins (sessionId, promptText, promptNumber)
- \`turn:end\` — agent turn ends (sessionId, stopReason, durationMs)

### File system
- \`fs:beforeRead\` — before file read (sessionId, path, line, limit)
- \`fs:beforeWrite\` — before file write (sessionId, path, content)

### Terminal
- \`terminal:beforeCreate\` — before terminal process spawned (sessionId, command, args, env, cwd)
- \`terminal:afterExit\` — after terminal process exits (sessionId, terminalId, command, exitCode, durationMs)

### Permission
- \`permission:beforeRequest\` — before permission prompt (sessionId, request, autoResolve)
- \`permission:afterResolve\` — after permission resolved (sessionId, requestId, decision, userId, durationMs)

### Session
- \`session:beforeCreate\` — before session creation (agentName, workingDir, userId, channelId, threadId)
- \`session:afterDestroy\` — after session destroyed (sessionId, reason, durationMs, promptCount)

### Control
- \`mode:beforeChange\` — before mode change (sessionId, fromMode, toMode)
- \`config:beforeChange\` — before config change (sessionId, configId, oldValue, newValue)
- \`model:beforeChange\` — before model change (sessionId, fromModel, toModel)
- \`agent:beforeCancel\` — before agent cancellation (sessionId, reason)

## Plugin Events (subscribe with ctx.on)

### System
- \`kernel:booted\`, \`system:ready\`, \`system:shutdown\`, \`system:commands-ready\`

### Plugin lifecycle
- \`plugin:loaded\`, \`plugin:failed\`, \`plugin:disabled\`, \`plugin:unloaded\`

### Session
- \`session:created\`, \`session:ended\`, \`session:named\`, \`session:updated\`

### Agent
- \`agent:event\`, \`agent:prompt\`

### Permission
- \`permission:request\`, \`permission:resolved\`

## Testing

Use \`@openacp/plugin-sdk/testing\`:

\`\`\`typescript
import { createTestContext, createTestInstallContext, mockServices } from '@openacp/plugin-sdk/testing'
\`\`\`

### createTestContext(opts)

Creates a test \`PluginContext\`. All state is in-memory.

\`\`\`typescript
const ctx = createTestContext({
  pluginName: '${pluginName}',
  pluginConfig: { enabled: true },
  permissions: plugin.permissions,
  services: { security: mockServices.security() },
})
await plugin.setup(ctx)
expect(ctx.registeredCommands.has('mycommand')).toBe(true)
const response = await ctx.executeCommand('mycommand', { raw: 'test' })
\`\`\`

Inspection properties: \`registeredServices\`, \`registeredCommands\`, \`registeredMiddleware\`, \`emittedEvents\`, \`sentMessages\`, \`executeCommand()\`.

### createTestInstallContext(opts)

Creates a test \`InstallContext\`. Terminal prompts auto-answered from \`terminalResponses\`.

\`\`\`typescript
const ctx = createTestInstallContext({
  pluginName: '${pluginName}',
  terminalResponses: { password: ['sk-test-key'], select: ['en'] },
})
await plugin.install!(ctx)
expect(ctx.settingsData.get('apiKey')).toBe('sk-test-key')
\`\`\`

### mockServices

Factory functions for mock service implementations:

\`\`\`typescript
mockServices.security(overrides?)    // checkAccess, checkSessionLimit, getUserRole
mockServices.fileService(overrides?) // saveFile, resolveFile, readTextFileWithRange
mockServices.notifications(overrides?) // notify, notifyAll
mockServices.usage(overrides?)       // trackUsage, checkBudget, getSummary
mockServices.speech(overrides?)      // textToSpeech, speechToText, register*
mockServices.tunnel(overrides?)      // getPublicUrl, start, stop, getStore, fileUrl, diffUrl
mockServices.context(overrides?)     // buildContext, registerProvider
\`\`\`

## Conventions

- **ESM-only**: \`"type": "module"\` in package.json
- **Import extensions**: All imports must use \`.js\` extension (e.g., \`import x from './util.js'\`)
- **TypeScript strict mode**: \`strict: true\` in tsconfig.json
- **Target**: ES2022, module NodeNext
- **Test framework**: Vitest
- **Test files**: \`src/**/__tests__/*.test.ts\`

## How to Add a Command

\`\`\`typescript
// In setup():
ctx.registerCommand({
  name: 'mycommand',
  description: 'Does something useful',
  usage: '<arg>',
  category: 'plugin',
  async handler(args) {
    const input = args.raw.trim()
    if (!input) return { type: 'error', message: 'Usage: /mycommand <arg>' }
    return { type: 'text', text: \\\`Result: \\\${input}\\\` }
  },
})
\`\`\`

Requires \`commands:register\` permission. Available as \`/mycommand\` (if no conflict) and \`/pluginscope:mycommand\` (always).

## How to Add a Service

\`\`\`typescript
// In setup():
const myService = new MyService()
ctx.registerService('my-service', myService)
\`\`\`

Requires \`services:register\` permission. Other plugins consume with \`ctx.getService<MyService>('my-service')\`.

## How to Add Middleware

\`\`\`typescript
// In setup():
ctx.registerMiddleware('message:outgoing', {
  priority: 50,  // lower = earlier execution
  handler: async (payload, next) => {
    payload.message.text = modifyText(payload.message.text)
    return next()  // continue chain; return null to block
  },
})
\`\`\`

Requires \`middleware:register\` permission.

## How Settings Work

1. Define \`settingsSchema\` (Zod) on the plugin object
2. In \`install()\`: use \`ctx.terminal\` for interactive prompts, save with \`ctx.settings.set()\`
3. In \`configure()\`: re-run prompts with current values pre-filled
4. In \`setup()\`: read settings from \`ctx.pluginConfig\`
5. In \`migrate()\`: transform old settings to new format on version change

## Version Compatibility

The \`engines.openacp\` field in package.json declares the minimum CLI version. OpenACP checks this on install and warns if incompatible.
`,
  )

  // PLUGIN_GUIDE.md — human-readable developer guide
  fs.writeFileSync(
    path.join(targetDir, 'PLUGIN_GUIDE.md'),
    `# Plugin Developer Guide

## Overview

**${pluginName}** is an OpenACP plugin.

> TODO: Describe what this plugin does.

## Project Structure

\`\`\`
src/
  index.ts              — Plugin entry point (exports OpenACPPlugin object)
  __tests__/
    index.test.ts       — Tests using Vitest + @openacp/plugin-sdk/testing
package.json            — npm package config with engines.openacp constraint
tsconfig.json           — TypeScript strict mode, ES2022, NodeNext
CLAUDE.md               — Full technical reference for AI coding agents
PLUGIN_GUIDE.md         — This file
\`\`\`

## Development Workflow

1. **Edit** \`src/index.ts\` — implement your plugin logic
2. **Dev mode**: \`openacp dev .\` — compiles, watches, and hot-reloads your plugin
3. **Test**: \`npm test\` — runs Vitest with SDK testing utilities
4. **Build**: \`npm run build\` — compiles TypeScript to \`dist/\`

\`\`\`bash
npm install
openacp dev .     # start developing with hot-reload
npm test          # run tests
npm run build     # compile for publishing
\`\`\`

## Adding a Command

Register commands in your \`setup()\` function. Requires \`commands:register\` permission.

\`\`\`typescript
async setup(ctx: PluginContext) {
  ctx.registerCommand({
    name: 'greet',
    description: 'Send a greeting',
    usage: '[name]',
    category: 'plugin',
    async handler(args) {
      const name = args.raw.trim() || 'World'
      return { type: 'text', text: \\\`Hello, \\\${name}!\\\` }
    },
  })
}
\`\`\`

The command will be available as \`/greet\` in all messaging platforms.

## Adding a Service

Provide a service that other plugins can consume. Requires \`services:register\` permission.

\`\`\`typescript
async setup(ctx: PluginContext) {
  const myService = {
    doSomething(input: string): string {
      return input.toUpperCase()
    },
  }
  ctx.registerService('my-service', myService)
}
\`\`\`

Other plugins access it with \`ctx.getService<MyServiceType>('my-service')\`.

## Adding Middleware

Intercept and modify message flows. Requires \`middleware:register\` permission.

\`\`\`typescript
async setup(ctx: PluginContext) {
  ctx.registerMiddleware('message:outgoing', {
    priority: 50,
    handler: async (payload, next) => {
      // Modify the message before delivery
      payload.message.text += '\\n-- sent via ${pluginName}'
      return next()  // continue the chain
      // return null to block the message entirely
    },
  })
}
\`\`\`

## Handling Settings

### Install flow (first-time setup)

\`\`\`typescript
async install(ctx: InstallContext) {
  const apiKey = await ctx.terminal.password({
    message: 'Enter your API key:',
    validate: (v) => v.length > 0 ? undefined : 'Required',
  })
  await ctx.settings.set('apiKey', apiKey)
  ctx.terminal.log.success('Configured!')
}
\`\`\`

### Configure flow (reconfiguration)

\`\`\`typescript
async configure(ctx: InstallContext) {
  const current = await ctx.settings.getAll()
  const apiKey = await ctx.terminal.password({
    message: \\\`API key (current: \\\${current.apiKey ? '***' : 'not set'}):\\\`,
  })
  if (apiKey) await ctx.settings.set('apiKey', apiKey)
  ctx.terminal.log.success('Updated!')
}
\`\`\`

### Reading settings at runtime

\`\`\`typescript
async setup(ctx: PluginContext) {
  const apiKey = ctx.pluginConfig.apiKey as string
  if (!apiKey) {
    ctx.log.warn('Not configured — run: openacp plugin configure ${pluginName}')
    return
  }
  // Use apiKey...
}
\`\`\`

## Testing

Tests use Vitest and \`@openacp/plugin-sdk/testing\`.

\`\`\`typescript
import { describe, it, expect } from 'vitest'
import { createTestContext, createTestInstallContext, mockServices } from '@openacp/plugin-sdk/testing'
import plugin from '../index.js'

describe('${pluginName}', () => {
  it('registers commands on setup', async () => {
    const ctx = createTestContext({ pluginName: '${pluginName}' })
    await plugin.setup(ctx)
    expect(ctx.registeredCommands.has('greet')).toBe(true)
  })

  it('command returns expected response', async () => {
    const ctx = createTestContext({ pluginName: '${pluginName}' })
    await plugin.setup(ctx)
    const res = await ctx.executeCommand('greet', { raw: 'Alice' })
    expect(res).toEqual({ type: 'text', text: 'Hello, Alice!' })
  })

  it('install saves settings', async () => {
    const ctx = createTestInstallContext({
      pluginName: '${pluginName}',
      terminalResponses: { password: ['sk-test-key'] },
    })
    await plugin.install!(ctx)
    expect(ctx.settingsData.get('apiKey')).toBe('sk-test-key')
  })
})
\`\`\`

### Available mock services

\`\`\`typescript
const ctx = createTestContext({
  pluginName: '${pluginName}',
  services: {
    security: mockServices.security(),
    usage: mockServices.usage({ async checkBudget() { return { ok: false, percent: 100 } } }),
  },
})
\`\`\`

## Publishing

1. Update \`version\` in both \`package.json\` and \`src/index.ts\`
2. Build and test:
   \`\`\`bash
   npm run build
   npm test
   \`\`\`
3. Publish:
   \`\`\`bash
   npm publish --access public
   \`\`\`
4. Users install with:
   \`\`\`bash
   openacp plugin install ${pluginName}
   \`\`\`
5. Submit to the [OpenACP Plugin Registry](https://github.com/Open-ACP/plugin-registry) for discoverability.

## Useful Links

- [Architecture: Plugin System](https://docs.openacp.dev/architecture/plugin-system)
- [Architecture: Writing Plugins](https://docs.openacp.dev/architecture/writing-plugins)
- [Architecture: Command System](https://docs.openacp.dev/architecture/command-system)
- [Plugin SDK Reference](https://docs.openacp.dev/extending/plugin-sdk-reference)
- [Getting Started: Your First Plugin](https://docs.openacp.dev/extending/getting-started-plugin)
- [Dev Mode](https://docs.openacp.dev/extending/dev-mode)
- [Contributing](https://github.com/Open-ACP/OpenACP/blob/main/CONTRIBUTING.md)
`,
  )

  // src/__tests__/index.test.ts
  fs.writeFileSync(
    path.join(targetDir, 'src', '__tests__', 'index.test.ts'),
    `import { describe, it, expect } from 'vitest'
import { createTestContext, createTestInstallContext } from '@openacp/plugin-sdk/testing'
import plugin from '../index.js'

describe('${pluginName}', () => {
  it('has correct metadata', () => {
    expect(plugin.name).toBe('${pluginName}')
    expect(plugin.version).toBeDefined()
    expect(plugin.setup).toBeInstanceOf(Function)
  })

  it('sets up without errors', async () => {
    const ctx = createTestContext({
      pluginName: '${pluginName}',
      pluginConfig: { enabled: true },
      permissions: plugin.permissions,
    })
    await expect(plugin.setup(ctx)).resolves.not.toThrow()
  })

  it('tears down without errors', async () => {
    if (plugin.teardown) {
      await expect(plugin.teardown()).resolves.not.toThrow()
    }
  })

  it('installs without errors', async () => {
    if (plugin.install) {
      const ctx = createTestInstallContext({
        pluginName: '${pluginName}',
        terminalResponses: { password: [''], confirm: [true], select: ['apiKey'] },
      })
      await expect(plugin.install(ctx)).resolves.not.toThrow()
    }
  })
})
`,
  )

  spinner.stop('Plugin scaffolded!')

  p.note(
    [
      `cd ${dirName}`,
      'npm install',
      'npm run build',
      'npm test',
      '',
      '# Start development with hot-reload:',
      `openacp dev .`,
    ].join('\n'),
    'Next steps',
  )

  p.outro(`Plugin ${pluginName} created in ./${dirName}`)
}
