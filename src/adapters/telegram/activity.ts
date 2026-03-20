import type { Bot } from 'grammy'
import { createChildLogger } from '../../core/log.js'
import { formatUsage } from './formatting.js'
import type { TelegramSendQueue } from './send-queue.js'
import type { PlanEntry } from '../../core/types.js'

const log = createChildLogger({ module: 'telegram:activity' })

// ─── ThinkingIndicator ────────────────────────────────────────────────────────

export class ThinkingIndicator {
  private msgId?: number

  constructor(
    private api: Bot['api'],
    private chatId: number,
    private threadId: number,
    private sendQueue: TelegramSendQueue,
  ) {}

  async show(): Promise<void> {
    if (this.msgId) return
    try {
      const result = await this.sendQueue.enqueue(() =>
        this.api.sendMessage(this.chatId, '💭 <i>Thinking...</i>', {
          message_thread_id: this.threadId,
          parse_mode: 'HTML',
          disable_notification: true,
        }),
      )
      if (result) this.msgId = result.message_id
    } catch (err) {
      log.warn({ err }, 'ThinkingIndicator.show() failed')
    }
  }

  async dismiss(): Promise<void> {
    if (!this.msgId) return
    const id = this.msgId
    this.msgId = undefined
    try {
      await this.sendQueue.enqueue(() => this.api.deleteMessage(this.chatId, id))
    } catch (err) {
      log.warn({ err }, 'ThinkingIndicator.dismiss() failed')
    }
  }
}

// ─── UsageMessage ─────────────────────────────────────────────────────────────

export class UsageMessage {
  private msgId?: number

  constructor(
    private api: Bot['api'],
    private chatId: number,
    private threadId: number,
    private sendQueue: TelegramSendQueue,
  ) {}

  async send(usage: { tokensUsed?: number; contextSize?: number }): Promise<void> {
    const text = formatUsage(usage)
    try {
      if (this.msgId) {
        await this.sendQueue.enqueue(() =>
          this.api.editMessageText(this.chatId, this.msgId!, text, {
            parse_mode: 'HTML',
          }),
        )
      } else {
        const result = await this.sendQueue.enqueue(() =>
          this.api.sendMessage(this.chatId, text, {
            message_thread_id: this.threadId,
            parse_mode: 'HTML',
            disable_notification: true,
          }),
        )
        if (result) this.msgId = result.message_id
      }
    } catch (err) {
      log.warn({ err }, 'UsageMessage.send() failed')
    }
  }

  async delete(): Promise<void> {
    if (!this.msgId) return
    const id = this.msgId
    this.msgId = undefined
    try {
      await this.sendQueue.enqueue(() => this.api.deleteMessage(this.chatId, id))
    } catch (err) {
      log.warn({ err }, 'UsageMessage.delete() failed')
    }
  }
}

// ─── PlanCard placeholder (implemented in Task 3) ────────────────────────────

export class PlanCard {
  constructor(
    _api: Bot['api'],
    _chatId: number,
    _threadId: number,
    _sendQueue: TelegramSendQueue,
  ) {}
  update(_entries: PlanEntry[]): void {}
  async finalize(): Promise<void> {}
  destroy(): void {}
}

// ─── ActivityTracker placeholder (implemented in Task 4) ─────────────────────

export class ActivityTracker {
  constructor(
    _api: Bot['api'],
    _chatId: number,
    _threadId: number,
    _sendQueue: TelegramSendQueue,
  ) {}
  async onNewPrompt(): Promise<void> {}
  async onThought(): Promise<void> {}
  async onPlan(_entries: PlanEntry[]): Promise<void> {}
  async onToolCall(): Promise<void> {}
  async onTextStart(): Promise<void> {}
  async sendUsage(_data: { tokensUsed?: number; contextSize?: number }): Promise<void> {}
  async onComplete(): Promise<void> {}
  destroy(): void {}
}
