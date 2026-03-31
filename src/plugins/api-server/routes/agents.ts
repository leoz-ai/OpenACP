import type { FastifyInstance } from 'fastify';
import type { RouteDeps } from './types.js';
import { getAgentCapabilities } from '../../../core/agents/agent-registry.js';

export async function agentRoutes(
  app: FastifyInstance,
  deps: RouteDeps,
): Promise<void> {
  // GET /agents — list all available agents
  app.get('/', async () => {
    const agents = deps.core.agentManager.getAvailableAgents();
    const defaultAgent = deps.core.configManager.get().defaultAgent;
    const agentsWithCaps = agents.map((a) => ({
      ...a,
      capabilities: getAgentCapabilities(a.name),
    }));
    return { agents: agentsWithCaps, default: defaultAgent };
  });
}
