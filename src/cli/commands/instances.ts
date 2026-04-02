import path from 'node:path'
import os from 'node:os'
import { InstanceRegistry } from '../../core/instance/instance-registry.js'
import { getGlobalRoot } from '../../core/instance/instance-context.js'
import { readInstanceInfo } from './status.js'
import { isJsonMode, jsonSuccess, muteForJson } from '../output.js'
import { wantsHelp } from './helpers.js'

export interface InstanceListEntry {
  id: string
  name: string | null
  directory: string
  root: string
  status: 'running' | 'stopped'
  port: number | null
}

export async function buildInstanceListEntries(): Promise<InstanceListEntry[]> {
  const registryPath = path.join(getGlobalRoot(), 'instances.json')
  const registry = new InstanceRegistry(registryPath)
  registry.load()
  return registry.list().map(entry => {
    const info = readInstanceInfo(entry.root)
    return {
      id: entry.id,
      name: info.name,
      directory: path.dirname(entry.root),
      root: entry.root,
      status: (info.pid ? 'running' : 'stopped') as 'running' | 'stopped',
      port: info.apiPort,
    }
  })
}

export async function cmdInstances(args: string[] = []): Promise<void> {
  const sub = args[0]
  const subArgs = args.slice(1)

  if (!sub || sub === 'list') return cmdInstancesList(subArgs)
  if (sub === 'create') return cmdInstancesCreate(subArgs)

  if (wantsHelp(args)) {
    printInstancesHelp()
    return
  }

  console.error(`Unknown subcommand: instances ${sub}`)
  printInstancesHelp()
  process.exit(1)
}

function printInstancesHelp(): void {
  console.log(`
\x1b[1mopenacp instances\x1b[0m — Manage OpenACP instances

\x1b[1mSubcommands:\x1b[0m
  list      List all registered instances
  create    Create or register an instance

\x1b[1mOptions:\x1b[0m
  --json    Output as JSON
`)
}

async function cmdInstancesList(args: string[]): Promise<void> {
  const json = isJsonMode(args)
  if (json) await muteForJson()

  const entries = await buildInstanceListEntries()

  if (json) {
    jsonSuccess(entries)
    return
  }

  if (entries.length === 0) {
    console.log('No instances registered.')
    return
  }

  console.log('')
  console.log('  Status     ID               Name             Directory')
  console.log('  ' + '─'.repeat(70))
  for (const e of entries) {
    const status = e.status === 'running' ? '● running' : '○ stopped'
    const port = e.port ? `:${e.port}` : '—'
    const dir = e.directory.replace(os.homedir(), '~')
    const name = (e.name ?? e.id).padEnd(16)
    console.log(`  ${status.padEnd(10)} ${e.id.padEnd(16)} ${name} ${dir}  ${port}`)
  }
  console.log('')
}

// cmdInstancesCreate will be implemented in Task 2
export async function cmdInstancesCreate(_args: string[]): Promise<void> {
  console.error('instances create not yet implemented')
  process.exit(1)
}
