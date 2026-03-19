#!/usr/bin/env node

import { ConfigManager } from './config.js'
import { OpenACPCore } from './core.js'
import { log } from './log.js'

let shuttingDown = false

async function main() {
  // 1. Load config
  const configManager = new ConfigManager()
  await configManager.load()  // exits if config missing/invalid

  const config = configManager.get()
  log.info('Config loaded from', configManager['configPath'])

  // 2. Create core
  const core = new OpenACPCore(configManager)

  // 3. Register enabled adapters
  if (config.channels.telegram?.enabled) {
    // Resolve adapter from workspace root (not from core's node_modules, to avoid circular dep)
    const adapterPath = new URL('../../adapters/telegram/dist/index.js', import.meta.url).pathname
    // @ts-ignore — dynamic path import
    const { TelegramAdapter } = await import(adapterPath)
    core.registerAdapter('telegram', new TelegramAdapter(core, config.channels.telegram))
    log.info('Telegram adapter registered')
  }

  if (core.adapters.size === 0) {
    log.error('No channels enabled. Enable at least one channel in config.')
    process.exit(1)
  }

  // 4. Start
  await core.start()

  // 5. Log ready
  const agents = Object.keys(config.agents).join(', ')
  log.info(`OpenACP started. Agents: ${agents}`)
  log.info('Press Ctrl+C to stop.')

  // 6. Graceful shutdown
  const shutdown = async (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    log.info(`${signal} received. Shutting down...`)

    try {
      await core.stop()
    } catch (err) {
      log.error('Error during shutdown:', err)
    }

    process.exit(0)
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))

  process.on('uncaughtException', (err) => {
    log.error('Uncaught exception:', err)
  })

  process.on('unhandledRejection', (err) => {
    log.error('Unhandled rejection:', err)
  })
}

main().catch((err) => {
  log.error('Fatal:', err)
  process.exit(1)
})
