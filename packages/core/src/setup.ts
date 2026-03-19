import { execSync } from 'node:child_process'
import { input, confirm, select, checkbox } from '@inquirer/prompts'
import type { Config, ConfigManager } from './config.js'

// --- Telegram validation ---

export async function validateBotToken(token: string): Promise<
  { ok: true; botName: string; botUsername: string } | { ok: false; error: string }
> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`)
    const data = await res.json() as { ok: boolean; result?: { first_name: string; username: string }; description?: string }
    if (data.ok && data.result) {
      return { ok: true, botName: data.result.first_name, botUsername: data.result.username }
    }
    return { ok: false, error: data.description || 'Invalid token' }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function validateChatId(token: string, chatId: number): Promise<
  { ok: true; title: string; isForum: boolean } | { ok: false; error: string }
> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getChat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId }),
    })
    const data = await res.json() as {
      ok: boolean
      result?: { title: string; type: string; is_forum?: boolean }
      description?: string
    }
    if (!data.ok || !data.result) {
      return { ok: false, error: data.description || 'Invalid chat ID' }
    }
    if (data.result.type !== 'supergroup') {
      return { ok: false, error: `Chat is "${data.result.type}", must be a supergroup` }
    }
    return { ok: true, title: data.result.title, isForum: data.result.is_forum === true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

// --- Agent detection ---

const KNOWN_AGENTS: Array<{ name: string; commands: string[] }> = [
  { name: 'claude', commands: ['claude-agent-acp', 'claude', 'claude-code'] },
  { name: 'codex', commands: ['codex'] },
]

export async function detectAgents(): Promise<Array<{ name: string; command: string }>> {
  const found: Array<{ name: string; command: string }> = []
  for (const agent of KNOWN_AGENTS) {
    for (const cmd of agent.commands) {
      try {
        execSync(`command -v ${cmd}`, { stdio: 'pipe' })
        found.push({ name: agent.name, command: cmd })
        break // found one for this agent, skip alternatives
      } catch {
        // not found, try next
      }
    }
  }
  return found
}

export async function validateAgentCommand(command: string): Promise<boolean> {
  try {
    execSync(`command -v ${command}`, { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

// --- Setup steps ---

export async function setupTelegram(): Promise<NonNullable<Config['channels']['telegram']>> {
  console.log('\n--- Step 1: Telegram Setup ---\n')

  let botToken = ''
  let botUsername = ''
  let botName = ''

  while (true) {
    botToken = await input({
      message: 'Telegram bot token (from @BotFather):',
      validate: (val) => val.trim().length > 0 || 'Token cannot be empty',
    })
    botToken = botToken.trim()

    console.log('Validating bot token...')
    const result = await validateBotToken(botToken)
    if (result.ok) {
      botUsername = result.botUsername
      botName = result.botName
      console.log(`✓ Bot "${botName}" (@${botUsername}) connected`)
      break
    }
    console.log(`✗ Validation failed: ${result.error}`)
    const action = await select({
      message: 'What would you like to do?',
      choices: [
        { name: 'Re-enter token', value: 'retry' },
        { name: 'Skip validation (use token as-is)', value: 'skip' },
      ],
    })
    if (action === 'skip') break
  }

  let chatId = 0

  while (true) {
    const chatIdStr = await input({
      message: 'Telegram supergroup chat ID (e.g. -1001234567890):',
      validate: (val) => {
        const n = Number(val.trim())
        if (isNaN(n) || !Number.isInteger(n)) return 'Chat ID must be an integer'
        return true
      },
    })
    chatId = Number(chatIdStr.trim())

    console.log('Validating chat ID...')
    const result = await validateChatId(botToken, chatId)
    if (result.ok) {
      if (!result.isForum) {
        console.log(`⚠ Warning: "${result.title}" does not have Topics enabled.`)
        console.log('  Please enable Topics in group settings → Topics → Enable.')
      } else {
        console.log(`✓ Connected to "${result.title}" (Topics enabled)`)
      }
      break
    }
    console.log(`✗ Validation failed: ${result.error}`)
    const action = await select({
      message: 'What would you like to do?',
      choices: [
        { name: 'Re-enter chat ID', value: 'retry' },
        { name: 'Skip validation (use chat ID as-is)', value: 'skip' },
      ],
    })
    if (action === 'skip') break
  }

  return {
    enabled: true,
    botToken,
    chatId,
    notificationTopicId: null,
    assistantTopicId: null,
  }
}

export async function setupAgents(): Promise<{ agents: Config['agents']; defaultAgent: string }> {
  console.log('\n--- Step 2: Agent Setup ---\n')

  console.log('Detecting agents in PATH...')
  const detected = await detectAgents()

  const agents: Config['agents'] = {}

  if (detected.length > 0) {
    console.log(`Found: ${detected.map(a => `${a.name} (${a.command})`).join(', ')}`)

    const selected = await checkbox({
      message: 'Which agents do you want to enable?',
      choices: detected.map(a => ({
        name: `${a.name} (${a.command})`,
        value: a,
        checked: true,
      })),
    })

    if (selected.length === 0) {
      console.log('No agents selected from detected list.')
    }

    for (const agent of selected) {
      agents[agent.name] = { command: agent.command, args: [], env: {} }
    }
  } else {
    console.log('No known agents detected in PATH.')
  }

  let addMore = Object.keys(agents).length === 0
    ? true
    : await confirm({ message: 'Add a custom agent?', default: false })

  while (addMore) {
    const name = await input({
      message: 'Agent name (e.g. my-agent):',
      validate: (val) => val.trim().length > 0 || 'Name cannot be empty',
    })
    const command = await input({
      message: 'Agent command (binary name or path):',
      validate: (val) => val.trim().length > 0 || 'Command cannot be empty',
    })

    const exists = await validateAgentCommand(command.trim())
    if (!exists) {
      console.log(`⚠ Warning: "${command.trim()}" not found in PATH. It may need to be installed.`)
    }

    agents[name.trim()] = { command: command.trim(), args: [], env: {} }
    addMore = await confirm({ message: 'Add another agent?', default: false })
  }

  if (Object.keys(agents).length === 0) {
    throw new Error('Setup cancelled: at least one agent is required')
  }

  const agentNames = Object.keys(agents)
  let defaultAgent: string

  if (agentNames.length === 1) {
    defaultAgent = agentNames[0]
    console.log(`Default agent: ${defaultAgent}`)
  } else {
    defaultAgent = await select({
      message: 'Which agent should be the default?',
      choices: agentNames.map(n => ({ name: n, value: n })),
    })
  }

  return { agents, defaultAgent }
}

export async function setupWorkspace(): Promise<{ baseDir: string }> {
  console.log('\n--- Step 3: Workspace Setup ---\n')

  const baseDir = await input({
    message: 'Workspace base directory:',
    default: '~/openacp-workspace',
    validate: (val) => val.trim().length > 0 || 'Path cannot be empty',
  })

  return { baseDir: baseDir.trim() }
}

export async function setupSecurity(): Promise<Config['security']> {
  console.log('\n--- Step 4: Security Setup ---\n')

  const userIdsStr = await input({
    message: 'Allowed Telegram user IDs (comma-separated, or leave empty to allow all):',
    default: '',
  })

  const allowedUserIds = userIdsStr.trim()
    ? userIdsStr.split(',').map(id => id.trim()).filter(id => id.length > 0)
    : []

  const maxConcurrentStr = await input({
    message: 'Max concurrent sessions:',
    default: '5',
    validate: (val) => {
      const n = Number(val)
      return (!isNaN(n) && Number.isInteger(n) && n > 0) || 'Must be a positive integer'
    },
  })

  const timeoutStr = await input({
    message: 'Session timeout (minutes):',
    default: '60',
    validate: (val) => {
      const n = Number(val)
      return (!isNaN(n) && Number.isInteger(n) && n > 0) || 'Must be a positive integer'
    },
  })

  return {
    allowedUserIds,
    maxConcurrentSessions: Number(maxConcurrentStr),
    sessionTimeoutMinutes: Number(timeoutStr),
  }
}

// --- Orchestrator ---

function printWelcomeBanner(): void {
  console.log(`
┌──────────────────────────────────────┐
│                                      │
│   Welcome to OpenACP!                │
│                                      │
│   Let's set up your configuration.   │
│                                      │
└──────────────────────────────────────┘
`)
}

function printConfigSummary(config: Config): void {
  console.log('\n--- Configuration Summary ---\n')

  console.log('Telegram:')
  const tg = config.channels.telegram
  if (tg) {
    console.log(`  Bot token: ${tg.botToken.slice(0, 8)}...${tg.botToken.slice(-4)}`)
    console.log(`  Chat ID: ${tg.chatId}`)
  }

  console.log('\nAgents:')
  for (const [name, agent] of Object.entries(config.agents)) {
    const marker = name === config.defaultAgent ? ' (default)' : ''
    console.log(`  ${name}: ${agent.command}${marker}`)
  }

  console.log(`\nWorkspace: ${config.workspace.baseDir}`)

  console.log('\nSecurity:')
  const sec = config.security
  console.log(`  Allowed users: ${sec.allowedUserIds.length === 0 ? 'all' : sec.allowedUserIds.join(', ')}`)
  console.log(`  Max concurrent sessions: ${sec.maxConcurrentSessions}`)
  console.log(`  Session timeout: ${sec.sessionTimeoutMinutes} minutes`)
}

export async function runSetup(configManager: ConfigManager): Promise<boolean> {
  printWelcomeBanner()

  try {
    const telegram = await setupTelegram()
    const { agents, defaultAgent } = await setupAgents()
    const workspace = await setupWorkspace()
    const security = await setupSecurity()

    const config: Config = {
      channels: { telegram },
      agents,
      defaultAgent,
      workspace,
      security,
    }

    printConfigSummary(config)

    const confirmed = await confirm({ message: '\nSave this configuration?', default: true })
    if (!confirmed) {
      console.log('Setup cancelled. No config file was created.')
      return false
    }

    try {
      await configManager.writeNew(config)
    } catch (writeErr) {
      console.error(`\n✗ Failed to write config to ${configManager.getConfigPath()}`)
      console.error(`  Error: ${(writeErr as Error).message}`)
      console.error('  Check that you have write permissions to this path.')
      return false
    }
    console.log(`\n✓ Config saved to ${configManager.getConfigPath()}`)

    const shouldStart = await confirm({ message: 'Start OpenACP now?', default: true })
    return shouldStart
  } catch (err) {
    // Ctrl+C from inquirer throws ExitPromptError
    if ((err as Error).name === 'ExitPromptError') {
      console.log('\nSetup cancelled.')
      return false
    }
    throw err
  }
}
