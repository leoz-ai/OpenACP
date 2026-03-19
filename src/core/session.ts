import { nanoid } from 'nanoid'
import type { AgentInstance } from './agent-instance.js'
import type { ChannelAdapter } from './channel.js'
import type { SessionStatus } from './types.js'
import { log } from './log.js'

export class Session {
  id: string
  channelId: string
  threadId: string = ''
  agentName: string
  workingDirectory: string
  agentInstance: AgentInstance
  status: SessionStatus = 'initializing'
  name?: string
  promptQueue: string[] = []
  promptRunning: boolean = false
  createdAt: Date = new Date()
  adapter?: ChannelAdapter  // Set by wireSessionEvents for renaming
  pendingPermission?: { requestId: string; resolve: (optionId: string) => void }

  constructor(opts: {
    id?: string
    channelId: string
    agentName: string
    workingDirectory: string
    agentInstance: AgentInstance
  }) {
    this.id = opts.id || nanoid(12)
    this.channelId = opts.channelId
    this.agentName = opts.agentName
    this.workingDirectory = opts.workingDirectory
    this.agentInstance = opts.agentInstance
  }

  async enqueuePrompt(text: string): Promise<void> {
    if (this.promptRunning) {
      this.promptQueue.push(text)
      log.debug(`Prompt queued for session ${this.id} (${this.promptQueue.length} in queue)`)
      return
    }
    await this.runPrompt(text)
  }

  private async runPrompt(text: string): Promise<void> {
    this.promptRunning = true
    this.status = 'active'

    try {
      await this.agentInstance.prompt(text)

      // Auto-name after first user prompt
      if (!this.name) {
        await this.autoName()
      }
    } catch (err) {
      this.status = 'error'
      log.error(`Prompt failed for session ${this.id}:`, err)
    } finally {
      this.promptRunning = false

      // Process next queued prompt
      if (this.promptQueue.length > 0) {
        const next = this.promptQueue.shift()!
        await this.runPrompt(next)
      }
    }
  }

  // NOTE: This injects a summary prompt into the agent's conversation history.
  // Known Phase 1 limitation — the agent sees this prompt in its context.
  private async autoName(): Promise<void> {
    let title = ''
    const prevHandler = this.agentInstance.onSessionUpdate
    this.agentInstance.onSessionUpdate = (event) => {
      if (event.type === 'text') title += event.content
    }

    try {
      await this.agentInstance.prompt(
        'Summarize this conversation in max 5 words for a topic title. Reply ONLY with the title, nothing else.'
      )
      this.name = title.trim().slice(0, 50)

      // Rename the topic on the channel
      if (this.adapter && this.name) {
        await this.adapter.renameSessionThread(this.id, this.name)
      }
    } catch {
      this.name = `Session ${this.id.slice(0, 6)}`
    } finally {
      this.agentInstance.onSessionUpdate = prevHandler
    }
  }

  async cancel(): Promise<void> {
    this.status = 'cancelled'
    await this.agentInstance.cancel()
  }

  async destroy(): Promise<void> {
    await this.agentInstance.destroy()
  }
}
