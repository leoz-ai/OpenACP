import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { getGlobalRoot } from '../core/instance/instance-context.js'
import { InstanceRegistry } from '../core/instance/instance-registry.js'

/**
 * Prompt user to pick an instance when none was resolved (no flags, no .openacp in cwd).
 *
 * For the default command (bare `openacp`): offers "use existing" or "create new setup here".
 * For operational commands (start/stop/restart/etc.): only shows existing instances.
 */
export async function promptForInstance(opts: {
  allowCreate?: boolean
}): Promise<string> {
  const globalRoot = getGlobalRoot()
  const globalConfigExists = fs.existsSync(path.join(globalRoot, 'config.json'))
  const cwd = process.cwd()
  const localRoot = path.join(cwd, '.openacp')

  // Walk up from CWD to find nearest parent .openacp/
  const detectedParent = findParentInstance(cwd, globalRoot)

  // Nothing exists anywhere — go to global (setup wizard will handle first-time)
  // But if a parent instance exists, prefer it
  if (!globalConfigExists) return detectedParent ?? globalRoot

  // Non-interactive: prefer detected parent over global
  const isTTY = process.stdin.isTTY && process.stdout.isTTY
  if (!isTTY) return detectedParent ?? globalRoot

  // Collect existing instances from registry
  const registryPath = path.join(globalRoot, 'instances.json')
  const registry = new InstanceRegistry(registryPath)
  registry.load()
  const instances = registry.list().filter(e => fs.existsSync(e.root))

  // Format labels: "Name (global — path)" or "Name (local — path)"
  const instanceOptions = instances
    // Exclude detected parent — it will be added at the top separately
    .filter(e => !detectedParent || e.root !== detectedParent)
    .map(e => {
      let name = e.id
      try {
        const raw = fs.readFileSync(path.join(e.root, 'config.json'), 'utf-8')
        const parsed = JSON.parse(raw)
        if (parsed.instanceName) name = parsed.instanceName
      } catch { /* use id */ }
      const isGlobal = e.root === globalRoot
      const displayPath = e.root.replace(os.homedir(), '~')
      const type = isGlobal ? 'global' : 'local'
      return { value: e.root, label: `${name} workspace (${type} — ${displayPath})` }
    })

  // Prepend detected parent instance at the top
  if (detectedParent) {
    let name = path.basename(path.dirname(detectedParent))
    try {
      const raw = fs.readFileSync(path.join(detectedParent, 'config.json'), 'utf-8')
      const parsed = JSON.parse(raw)
      if (parsed.instanceName) name = parsed.instanceName
    } catch { /* use dir name */ }
    const displayPath = detectedParent.replace(os.homedir(), '~')
    instanceOptions.unshift({ value: detectedParent, label: `${name} workspace (detected — ${displayPath})` })
  }

  // Fallback if registry is empty but global config exists
  if (instanceOptions.length === 0) {
    const globalDisplay = globalRoot.replace(os.homedir(), '~')
    instanceOptions.push({ value: globalRoot, label: `Global workspace (${globalDisplay})` })
  }

  // Single instance + no create option → just use it, no prompt needed
  if (instanceOptions.length === 1 && !opts.allowCreate) {
    return instanceOptions[0]!.value
  }

  // Build prompt options
  const options: { value: string; label: string }[] = instanceOptions.map(o => ({
    value: o.value,
    label: o.label,
  }))

  if (opts.allowCreate) {
    const localDisplay = localRoot.replace(os.homedir(), '~')
    options.push({ value: localRoot, label: `New local workspace (${localDisplay})` })
  }

  const clack = await import('@clack/prompts')
  const choice = await clack.select({
    message: 'How would you like to run OpenACP?',
    options,
  })

  if (clack.isCancel(choice)) {
    process.exit(0)
  }

  if (choice === localRoot) {
    console.log(`\x1b[2mTip: next time use \`openacp --local\`\x1b[0m`)
  }

  return choice as string
}

/**
 * Walk up from `cwd` looking for a parent directory containing `.openacp/`.
 * Skips exact CWD (already handled by resolveInstanceRoot) and global root.
 * Returns the `.openacp/` path if found, or null.
 */
export function findParentInstance(cwd: string, globalRoot: string): string | null {
  let dir = path.dirname(cwd) // start from parent, not CWD itself
  while (true) {
    const candidate = path.join(dir, '.openacp')
    if (candidate !== globalRoot && fs.existsSync(candidate)) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}
