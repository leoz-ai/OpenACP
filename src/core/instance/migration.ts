import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { randomUUID } from 'node:crypto'
import { getGlobalRoot } from './instance-context.js'
import { InstanceRegistry } from './instance-registry.js'

/**
 * Migrate a legacy global instance from ~/.openacp/ to <workspace>/.openacp/.
 * Called once on first CLI invocation after upgrade.
 * Returns the new instance root if migration happened, null otherwise.
 */
export async function migrateGlobalInstance(): Promise<string | null> {
  const globalRoot = getGlobalRoot()
  const globalConfig = path.join(globalRoot, 'config.json')

  if (!fs.existsSync(globalConfig)) return null

  // Read old config to find workspace.baseDir
  let baseDir = path.join(os.homedir(), 'openacp-workspace')
  try {
    const raw = JSON.parse(fs.readFileSync(globalConfig, 'utf-8'))
    if (raw.workspace?.baseDir) {
      const configured = raw.workspace.baseDir as string
      baseDir = configured.startsWith('~')
        ? path.join(os.homedir(), configured.slice(1))
        : configured
    }
  } catch {
    // Use default
  }

  const targetRoot = path.join(baseDir, '.openacp')

  // Instance files to move (NOT shared files)
  const instanceFiles = [
    'config.json', 'sessions.json', 'agents.json', 'plugins.json',
    'tunnels.json', 'api-secret',
  ]
  const instanceDirs = ['plugins', 'logs', 'history', 'files']

  // Create target
  fs.mkdirSync(targetRoot, { recursive: true })

  // Move files
  for (const file of instanceFiles) {
    const src = path.join(globalRoot, file)
    const dst = path.join(targetRoot, file)
    if (fs.existsSync(src)) {
      fs.cpSync(src, dst, { force: true })
      fs.rmSync(src)
    }
  }

  // Move directories
  for (const dir of instanceDirs) {
    const src = path.join(globalRoot, dir)
    const dst = path.join(targetRoot, dir)
    if (fs.existsSync(src)) {
      fs.cpSync(src, dst, { recursive: true, force: true })
      fs.rmSync(src, { recursive: true, force: true })
    }
  }

  // Move instance-specific cache (not registry-cache which stays shared)
  const srcCache = path.join(globalRoot, 'cache')
  const dstCache = path.join(targetRoot, 'cache')
  if (fs.existsSync(srcCache)) {
    fs.mkdirSync(dstCache, { recursive: true })
    for (const entry of fs.readdirSync(srcCache)) {
      if (entry === 'registry-cache.json') continue
      const s = path.join(srcCache, entry)
      const d = path.join(dstCache, entry)
      fs.cpSync(s, d, { recursive: true, force: true })
      fs.rmSync(s, { recursive: true, force: true })
    }
  }

  // Strip workspace.baseDir from migrated config
  const migratedConfigPath = path.join(targetRoot, 'config.json')
  try {
    const config = JSON.parse(fs.readFileSync(migratedConfigPath, 'utf-8'))
    if (config.workspace?.baseDir) {
      delete config.workspace.baseDir
    }
    fs.writeFileSync(migratedConfigPath, JSON.stringify(config, null, 2))
  } catch {
    // Non-critical
  }

  // Update instance registry
  const registryPath = path.join(globalRoot, 'instances.json')
  try {
    const registry = new InstanceRegistry(registryPath)
    registry.load()
    const oldEntry = registry.getByRoot(globalRoot)
    if (oldEntry) {
      registry.remove(oldEntry.id)
      registry.register(oldEntry.id, targetRoot)
    } else {
      registry.register(randomUUID(), targetRoot)
    }
    registry.save()
  } catch {
    // Non-critical
  }

  console.log(`\x1b[32m✓\x1b[0m Migrated global instance → ${baseDir.replace(os.homedir(), '~')}/.openacp`)

  return targetRoot
}
