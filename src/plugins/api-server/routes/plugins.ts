import type { FastifyInstance } from 'fastify'
import type { RouteDeps } from './types.js'
import { requireScopes } from '../middleware/auth.js'
import { corePlugins } from '../../../plugins/core-plugins.js'

export async function pluginRoutes(
  app: FastifyInstance,
  deps: RouteDeps,
): Promise<void> {
  const { lifecycleManager } = deps
  const admin = [requireScopes('system:admin')]

  // GET /plugins — list all installed plugins with runtime state
  app.get('/', { preHandler: admin }, async () => {
    if (!lifecycleManager?.registry) return { plugins: [] }

    const registry = lifecycleManager.registry
    const loadedSet = new Set(lifecycleManager.loadedPlugins)
    const failedSet = new Set(lifecycleManager.failedPlugins)
    const loadOrderMap = new Map(lifecycleManager.plugins.map((p) => [p.name, p]))
    const coreMap = new Map(corePlugins.map((p) => [p.name, p]))

    const plugins = Array.from(registry.list().entries()).map(([name, entry]) => {
      const def = loadOrderMap.get(name) ?? coreMap.get(name)
      return {
        name,
        version: entry.version,
        description: entry.description,
        source: entry.source,
        enabled: entry.enabled,
        loaded: loadedSet.has(name),
        failed: failedSet.has(name),
        essential: def?.essential ?? false,
        hasConfigure: typeof def?.configure === 'function',
      }
    })

    return { plugins }
  })
}
