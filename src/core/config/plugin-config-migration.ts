type RawConfig = Record<string, unknown>

interface PluginEntry {
  config: Record<string, unknown>
  enabled?: boolean
}

interface MigratedConfig extends RawConfig {
  plugins: {
    builtin: Record<string, PluginEntry>
  }
}

/**
 * Check if config needs migration to plugin-based format.
 * Returns true if the `plugins` field is missing.
 */
export function needsMigration(config: RawConfig): boolean {
  return !('plugins' in config) || config.plugins === undefined
}

/**
 * Migrate old flat config format to new plugin-based structure.
 *
 * Maps:
 *   channels.telegram → plugins.builtin['@openacp/telegram']
 *   security          → plugins.builtin['@openacp/security']
 *   speech            → plugins.builtin['@openacp/speech']
 *
 * Preserves top-level fields (defaultAgent, workingDirectory, debug, etc.).
 * Idempotent: already-migrated configs pass through unchanged.
 */
export function migrateConfig(config: RawConfig): MigratedConfig {
  // Already migrated — return as-is
  if (!needsMigration(config)) {
    return config as MigratedConfig
  }

  const builtin: Record<string, PluginEntry> = {}

  // Migrate channels.telegram
  const channels = config.channels as Record<string, unknown> | undefined
  if (channels && typeof channels === 'object') {
    const telegram = channels.telegram as Record<string, unknown> | undefined
    if (telegram && typeof telegram === 'object') {
      const { enabled, ...telegramConfig } = telegram
      builtin['@openacp/telegram'] = {
        config: telegramConfig as Record<string, unknown>,
        ...(enabled !== undefined ? { enabled: Boolean(enabled) } : {}),
      }
    }
  }

  // Migrate security
  const security = config.security as Record<string, unknown> | undefined
  if (security && typeof security === 'object') {
    builtin['@openacp/security'] = {
      config: { ...security },
    }
  }

  // Migrate speech
  const speech = config.speech as Record<string, unknown> | undefined
  if (speech && typeof speech === 'object') {
    builtin['@openacp/speech'] = {
      config: { ...speech },
    }
  }

  // Build result: preserve top-level fields, remove migrated sections, add plugins
  const { channels: _channels, security: _security, speech: _speech, ...rest } = config

  return {
    ...rest,
    plugins: { builtin },
  }
}
