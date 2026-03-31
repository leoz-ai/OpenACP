import type { OpenACPCore } from '../../../core/core.js';
import type { TopicManager } from '../../telegram/topic-manager.js';
import type { CommandRegistry } from '../../../core/command-registry.js';

/**
 * Dependencies injected into Fastify route plugins.
 * Each route plugin receives these via its options parameter.
 */
export interface RouteDeps {
  core: OpenACPCore;
  topicManager?: TopicManager;
  startedAt: number;
  getVersion: () => string;
  commandRegistry?: CommandRegistry;
}
