import type { AssistantSection } from '../assistant-registry.js'

export function createConfigSection(core: {
  configManager: { get(): { workspace: { baseDir: string }; speech?: { stt?: { provider?: string } } } }
  lifecycleManager?: { serviceRegistry: { get<T>(name: string): T | undefined } }
}): AssistantSection {
  return {
    id: 'core:config',
    title: 'Configuration',
    priority: 30,
    buildContext: () => {
      const config = core.configManager.get()
      const speechSvc = core.lifecycleManager?.serviceRegistry.get<{ isSTTAvailable(): boolean }>('speech')
      const sttActive = speechSvc ? speechSvc.isSTTAvailable() : !!config.speech?.stt?.provider
      return (
        `Workspace base: ${config.workspace.baseDir}\n` +
        `STT: ${sttActive ? `${config.speech?.stt?.provider ?? 'configured'} ✅` : 'Not configured'}`
      )
    },
    commands: [
      { command: 'openacp config', description: 'View config' },
      { command: 'openacp config set <key> <value>', description: 'Update config value' },
    ],
  }
}
