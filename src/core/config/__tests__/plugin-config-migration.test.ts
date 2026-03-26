import { describe, it, expect } from 'vitest'
import { migrateConfig, needsMigration } from '../plugin-config-migration.js'

describe('Plugin Config Migration', () => {
  it('detects old config (no plugins field)', () => {
    const old = { defaultAgent: 'claude', channels: { telegram: { botToken: 'abc' } } }
    expect(needsMigration(old)).toBe(true)
  })

  it('already-migrated config needs no migration', () => {
    const migrated = { defaultAgent: 'claude', plugins: { builtin: {} } }
    expect(needsMigration(migrated)).toBe(false)
  })

  it('maps channels.telegram to plugins.builtin', () => {
    const old = { channels: { telegram: { botToken: 'abc', chatId: 123, enabled: true, displayVerbosity: 'medium' } } }
    const result = migrateConfig(old)
    expect(result.plugins.builtin['@openacp/telegram'].config.botToken).toBe('abc')
    expect(result.plugins.builtin['@openacp/telegram'].config.chatId).toBe(123)
    expect(result.plugins.builtin['@openacp/telegram'].enabled).toBe(true)
  })

  it('maps security to plugins.builtin', () => {
    const old = { security: { allowedUserIds: ['123'], maxConcurrentSessions: 5 } }
    const result = migrateConfig(old)
    expect(result.plugins.builtin['@openacp/security'].config.allowedUserIds).toEqual(['123'])
  })

  it('maps speech to plugins.builtin', () => {
    const old = { speech: { sttProvider: 'groq', groqApiKey: 'key' } }
    const result = migrateConfig(old)
    expect(result.plugins.builtin['@openacp/speech'].config.sttProvider).toBe('groq')
  })

  it('preserves top-level fields', () => {
    const old = { defaultAgent: 'claude', workingDirectory: '/tmp', debug: true, channels: {} }
    const result = migrateConfig(old)
    expect(result.defaultAgent).toBe('claude')
    expect(result.workingDirectory).toBe('/tmp')
    expect(result.debug).toBe(true)
  })

  it('is idempotent', () => {
    const old = { defaultAgent: 'claude', channels: { telegram: { botToken: 'abc' } } }
    const first = migrateConfig(old)
    expect(needsMigration(first)).toBe(false)
  })
})
