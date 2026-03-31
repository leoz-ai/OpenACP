import type { FastifyInstance } from 'fastify';
import type { RouteDeps } from './types.js';

/**
 * System routes for health, version, restart, and adapters.
 * These complement the basic /health and /version in server.ts
 * by adding richer system information and admin operations.
 */
export async function systemRoutes(
  app: FastifyInstance,
  deps: RouteDeps,
): Promise<void> {
  // GET /system/health — detailed health info including sessions, adapters, tunnel
  app.get('/health', async () => {
    const activeSessions = deps.core.sessionManager.listSessions();
    const allRecords = deps.core.sessionManager.listRecords();
    const mem = process.memoryUsage();
    const tunnel = deps.core.tunnelService;

    return {
      status: 'ok',
      uptime: Date.now() - deps.startedAt,
      version: deps.getVersion(),
      memory: {
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
      },
      sessions: {
        active: activeSessions.filter(
          (s) => s.status === 'active' || s.status === 'initializing',
        ).length,
        total: allRecords.length,
      },
      adapters: Array.from(deps.core.adapters.keys()),
      tunnel: tunnel
        ? { enabled: true, url: tunnel.getPublicUrl() }
        : { enabled: false },
    };
  });

  // GET /system/version — get version
  app.get('/version', async () => {
    return { version: deps.getVersion() };
  });

  // POST /system/restart — request a graceful restart
  app.post('/restart', async (_request, reply) => {
    if (!deps.core.requestRestart) {
      return reply.status(501).send({ error: 'Restart not available' });
    }

    // Send response before restarting
    const response = { ok: true, message: 'Restarting...' };
    setImmediate(() => deps.core.requestRestart!());
    return response;
  });

  // GET /system/adapters — list connected adapters
  app.get('/adapters', async () => {
    const adapters = Array.from(deps.core.adapters.entries()).map(
      ([name]) => ({
        name,
        type: 'built-in' as const,
      }),
    );
    return { adapters };
  });
}
