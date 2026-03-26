import type { OpenACPPlugin } from '../../core/plugin/types.js'
import { ContextManager } from '../../core/context/context-manager.js'
import { EntireProvider } from '../../core/context/entire/entire-provider.js'

const contextPlugin: OpenACPPlugin = {
  name: '@openacp/context',
  version: '1.0.0',
  description: 'Conversation context management with pluggable providers',
  permissions: ['services:register'],

  async setup(ctx) {
    const manager = new ContextManager()
    manager.register(new EntireProvider())
    ctx.registerService('context', manager)
    ctx.log.info('Context service ready')
  },
}

export default contextPlugin
