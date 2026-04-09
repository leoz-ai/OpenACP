import path from 'node:path'
import { getGlobalRoot } from '../core/instance/instance-context.js'
import { InstanceRegistry } from '../core/instance/instance-registry.js'
import { createChildLogger } from '../core/utils/log.js'

const log = createChildLogger({ module: 'resolve-instance-id' })

/**
 * Resolve the stable instance ID for a given instance root.
 * Falls back to the parent directory name if not found in registry.
 */
export function resolveInstanceId(instanceRoot: string): string {
  try {
    const reg = new InstanceRegistry(path.join(getGlobalRoot(), 'instances.json'))
    reg.load()
    const entry = reg.getByRoot(instanceRoot)
    if (entry?.id) return entry.id
  } catch (err) {
    log.debug({ err: (err as Error).message, instanceRoot }, 'Could not read instance registry, using fallback id')
  }
  // Fallback: sanitized parent dir name (e.g. /home/user/my-project/.openacp → my-project)
  return path.basename(path.dirname(instanceRoot)).replace(/[^a-zA-Z0-9-]/g, '-') || 'default'
}
