import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ThinkingIndicator, UsageMessage } from './activity.js'
import type { TelegramSendQueue } from './send-queue.js'

// Minimal mock for TelegramSendQueue: runs the fn immediately, returns result
function makeMockQueue(): TelegramSendQueue {
  return {
    enqueue: vi.fn(async (fn: () => Promise<unknown>) => fn()),
    onRateLimited: vi.fn(),
  } as unknown as TelegramSendQueue
}

// Minimal mock for bot.api
function makeMockApi() {
  return {
    sendMessage: vi.fn().mockResolvedValue({ message_id: 42 }),
    deleteMessage: vi.fn().mockResolvedValue(true),
    editMessageText: vi.fn().mockResolvedValue(true),
  }
}

describe('ThinkingIndicator', () => {
  let api: ReturnType<typeof makeMockApi>
  let queue: TelegramSendQueue
  let indicator: ThinkingIndicator

  beforeEach(() => {
    api = makeMockApi()
    queue = makeMockQueue()
    indicator = new ThinkingIndicator(api as never, 100, 200, queue)
  })

  it('sends thinking message on first show()', async () => {
    await indicator.show()
    expect(api.sendMessage).toHaveBeenCalledOnce()
    expect(api.sendMessage).toHaveBeenCalledWith(
      100,
      '💭 <i>Thinking...</i>',
      expect.objectContaining({ message_thread_id: 200 }),
    )
  })

  it('does not send again on subsequent show() calls', async () => {
    await indicator.show()
    await indicator.show()
    await indicator.show()
    expect(api.sendMessage).toHaveBeenCalledOnce()
  })

  it('dismiss() is no-op when not shown', async () => {
    await indicator.dismiss()
    expect(api.deleteMessage).not.toHaveBeenCalled()
  })

  it('dismiss() deletes the message after show()', async () => {
    await indicator.show()
    await indicator.dismiss()
    expect(api.deleteMessage).toHaveBeenCalledWith(100, 42)
  })

  it('dismiss() clears msgId even if deleteMessage fails', async () => {
    api.deleteMessage.mockRejectedValue(new Error('not found'))
    await indicator.show()
    await indicator.dismiss()
    // Should not throw; subsequent dismiss() is a no-op
    await indicator.dismiss()
    expect(api.deleteMessage).toHaveBeenCalledOnce()
  })

  it('show() works again after dismiss()', async () => {
    await indicator.show()
    await indicator.dismiss()
    await indicator.show()
    expect(api.sendMessage).toHaveBeenCalledTimes(2)
  })
})

describe('UsageMessage', () => {
  let api: ReturnType<typeof makeMockApi>
  let queue: TelegramSendQueue
  let usage: UsageMessage

  beforeEach(() => {
    api = makeMockApi()
    queue = makeMockQueue()
    usage = new UsageMessage(api as never, 100, 200, queue)
  })

  it('sends new message on first send()', async () => {
    await usage.send({ tokensUsed: 10000, contextSize: 100000 })
    expect(api.sendMessage).toHaveBeenCalledOnce()
  })

  it('edits existing message on second send()', async () => {
    await usage.send({ tokensUsed: 10000, contextSize: 100000 })
    await usage.send({ tokensUsed: 20000, contextSize: 100000 })
    expect(api.sendMessage).toHaveBeenCalledOnce()
    expect(api.editMessageText).toHaveBeenCalledOnce()
    expect(api.editMessageText).toHaveBeenCalledWith(100, 42, expect.any(String), expect.any(Object))
  })

  it('delete() is no-op when nothing was sent', async () => {
    await usage.delete()
    expect(api.deleteMessage).not.toHaveBeenCalled()
  })

  it('delete() removes the message and clears msgId', async () => {
    await usage.send({ tokensUsed: 5000, contextSize: 50000 })
    await usage.delete()
    expect(api.deleteMessage).toHaveBeenCalledWith(100, 42)
  })

  it('delete() clears msgId even if deleteMessage fails', async () => {
    api.deleteMessage.mockRejectedValue(new Error('gone'))
    await usage.send({ tokensUsed: 5000, contextSize: 50000 })
    await usage.delete()
    // Second delete should be a no-op
    await usage.delete()
    expect(api.deleteMessage).toHaveBeenCalledOnce()
  })

  it('send() works after delete()', async () => {
    await usage.send({ tokensUsed: 5000, contextSize: 50000 })
    await usage.delete()
    await usage.send({ tokensUsed: 8000, contextSize: 50000 })
    expect(api.sendMessage).toHaveBeenCalledTimes(2)
    expect(api.editMessageText).not.toHaveBeenCalled()
  })
})
