import type { FastifyInstance } from 'fastify';
import type { RouteDeps } from './types.js';

export async function notifyRoutes(
  app: FastifyInstance,
  deps: RouteDeps,
): Promise<void> {
  // POST /notify — send a notification to all adapters
  app.post('/', async (request, reply) => {
    const body = request.body as { message?: string } | undefined;

    if (!body?.message) {
      return reply.status(400).send({ error: 'Missing message' });
    }

    await deps.core.notificationManager.notifyAll({
      sessionId: 'system',
      type: 'completed',
      summary: body.message,
    });
    return { ok: true };
  });
}
