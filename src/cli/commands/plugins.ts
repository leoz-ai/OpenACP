import { listPlugins } from '../../core/plugin-manager.js'
import { wantsHelp } from './helpers.js'

export async function cmdPlugins(args: string[] = []): Promise<void> {
  if (wantsHelp(args)) {
    console.log(`
\x1b[1mopenacp plugins\x1b[0m — List installed plugins

\x1b[1mUsage:\x1b[0m
  openacp plugins

Shows all plugins installed in ~/.openacp/plugins/.
`)
    return
  }
  const plugins = listPlugins()
  const entries = Object.entries(plugins)
  if (entries.length === 0) {
    console.log("No plugins installed.")
  } else {
    console.log("Installed plugins:")
    for (const [name, version] of entries) {
      console.log(`  ${name}@${version}`)
    }
  }
}

/**
 * `openacp plugin <subcommand>` — Extended plugin management.
 *
 * Subcommands:
 *   list              — List all plugins with status (same as `openacp plugins`)
 *   add <package>     — Install a plugin (placeholder)
 *   remove <package>  — Remove a plugin (placeholder)
 *   enable <name>     — Enable a plugin in config
 *   disable <name>    — Disable a plugin in config
 */
export async function cmdPlugin(args: string[] = []): Promise<void> {
  const subcommand = args[1] // args[0] is 'plugin'

  if (wantsHelp(args) || !subcommand) {
    console.log(`
\x1b[1mopenacp plugin\x1b[0m — Plugin management

\x1b[1mUsage:\x1b[0m
  openacp plugin list              List all plugins with status
  openacp plugin add <package>     Install a plugin package
  openacp plugin remove <package>  Remove a plugin package
  openacp plugin enable <name>     Enable a plugin
  openacp plugin disable <name>    Disable a plugin

\x1b[1mExamples:\x1b[0m
  openacp plugin list
  openacp plugin add @openacp/adapter-discord
  openacp plugin enable @openacp/adapter-discord
`)
    return
  }

  switch (subcommand) {
    case 'list':
      return cmdPlugins(args.slice(1))

    case 'add': {
      const pkg = args[2]
      if (!pkg) {
        console.error('Error: missing package name. Usage: openacp plugin add <package>')
        process.exit(1)
      }
      console.log(`npm install ${pkg} to ~/.openacp/plugins/ coming soon`)
      return
    }

    case 'remove': {
      const pkg = args[2]
      if (!pkg) {
        console.error('Error: missing package name. Usage: openacp plugin remove <package>')
        process.exit(1)
      }
      console.log(`Removing ${pkg} from ~/.openacp/plugins/ coming soon`)
      return
    }

    case 'enable': {
      const name = args[2]
      if (!name) {
        console.error('Error: missing plugin name. Usage: openacp plugin enable <name>')
        process.exit(1)
      }
      await setPluginEnabled(name, true)
      return
    }

    case 'disable': {
      const name = args[2]
      if (!name) {
        console.error('Error: missing plugin name. Usage: openacp plugin disable <name>')
        process.exit(1)
      }
      await setPluginEnabled(name, false)
      return
    }

    default:
      console.error(`Unknown subcommand: ${subcommand}`)
      console.error('Run "openacp plugin --help" for usage.')
      process.exit(1)
  }
}

async function setPluginEnabled(name: string, enabled: boolean): Promise<void> {
  const { ConfigManager } = await import('../../core/config/config.js')
  const cm = new ConfigManager()

  if (!(await cm.exists())) {
    console.error('No config found. Run "openacp" first to create one.')
    process.exit(1)
  }

  await cm.load()
  const config = cm.get() as Record<string, unknown>

  // Look in plugins.builtin, then channels
  const plugins = config.plugins as Record<string, Record<string, unknown>> | undefined
  const builtin = plugins?.builtin as Record<string, Record<string, unknown>> | undefined

  if (builtin?.[name]) {
    await cm.save({ plugins: { builtin: { [name]: { enabled } } } })
    console.log(`Plugin ${name} ${enabled ? 'enabled' : 'disabled'}.`)
    return
  }

  // Try channels (old format)
  const channels = config.channels as Record<string, Record<string, unknown>> | undefined
  if (channels) {
    // Try direct match (e.g., "telegram") or strip @openacp/ prefix
    const channelName = name.replace(/^@openacp\//, '')
    if (channels[channelName]) {
      await cm.save({ channels: { [channelName]: { enabled } } })
      console.log(`Channel ${channelName} ${enabled ? 'enabled' : 'disabled'}.`)
      return
    }
  }

  console.error(`Plugin "${name}" not found in config.`)
  process.exit(1)
}
