import type { OpenACPPlugin } from '../../core/plugin/types.js';
import type { OpenACPCore } from '../../core/core.js';
import type { ApiServerService } from '../api-server/service.js';
import type { CommandRegistry } from '../../core/command-registry.js';
import { ConnectionManager } from './connection-manager.js';
import { EventBuffer } from './event-buffer.js';
import { SSEAdapter } from './adapter.js';
import { sseRoutes } from './routes.js';

const plugin: OpenACPPlugin = {
  name: '@openacp/sse-adapter',
  version: '1.0.0',
  description: 'SSE-based messaging adapter for app clients',
  pluginDependencies: {
    '@openacp/api-server': '^1.0.0',
    '@openacp/security': '^1.0.0',
    '@openacp/notifications': '^1.0.0',
  },
  permissions: ['services:register', 'kernel:access', 'events:read'],

  async setup(ctx) {
    const core = ctx.core as OpenACPCore;
    const apiServer = ctx.getService<ApiServerService>('api-server');

    if (!apiServer) {
      ctx.log.warn('API server not available, SSE adapter disabled');
      return;
    }

    const connectionManager = new ConnectionManager();
    const eventBuffer = new EventBuffer(100);
    const adapter = new SSEAdapter(connectionManager, eventBuffer);

    // Register adapter as a service so main.ts wires it into core
    ctx.registerService('adapter:sse', adapter);

    // Get command registry for command execution in routes
    const commandRegistry = ctx.getService<CommandRegistry>('command-registry');

    // Register SSE routes on the api-server
    apiServer.registerPlugin('/sse', async (app) => {
      await sseRoutes(app, {
        core,
        connectionManager,
        eventBuffer,
        commandRegistry: commandRegistry ?? undefined,
      });
    }, { auth: true });

    ctx.log.info('SSE adapter registered');
  },

  async teardown() {
    // Adapter stop is handled by core.stop() which calls adapter.stop()
  },
};

export default plugin;
