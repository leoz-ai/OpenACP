import { describe, it, expect, vi, beforeEach } from 'vitest'
import { validateBotAdmin } from '../validators.js'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function makeMeResponse(botId: number) {
  return { ok: true, status: 200, json: async () => ({ ok: true, result: { id: botId } }) }
}

function makeMemberResponse(status: string, canManageTopics: boolean) {
  return {
    ok: true, status: 200,
    json: async () => ({
      ok: true,
      result: { status, can_manage_topics: canManageTopics },
    }),
  }
}

describe('validateBotAdmin', () => {
  beforeEach(() => mockFetch.mockReset())

  it('returns ok:true with canManageTopics:true when bot is admin with topic perm', async () => {
    mockFetch
      .mockResolvedValueOnce(makeMeResponse(42))
      .mockResolvedValueOnce(makeMemberResponse('administrator', true))

    const result = await validateBotAdmin('token123', -1001234)
    expect(result).toEqual({ ok: true, canManageTopics: true })
  })

  it('returns ok:true with canManageTopics:false when bot is admin without topic perm', async () => {
    mockFetch
      .mockResolvedValueOnce(makeMeResponse(42))
      .mockResolvedValueOnce(makeMemberResponse('administrator', false))

    const result = await validateBotAdmin('token123', -1001234)
    expect(result).toEqual({ ok: true, canManageTopics: false })
  })

  it('returns ok:true with canManageTopics:true when bot is creator', async () => {
    mockFetch
      .mockResolvedValueOnce(makeMeResponse(42))
      .mockResolvedValueOnce(makeMemberResponse('creator', false))

    const result = await validateBotAdmin('token123', -1001234)
    // creator always has all permissions
    expect(result).toEqual({ ok: true, canManageTopics: true })
  })

  it('returns ok:false when bot is not admin', async () => {
    mockFetch
      .mockResolvedValueOnce(makeMeResponse(42))
      .mockResolvedValueOnce(makeMemberResponse('member', false))

    const result = await validateBotAdmin('token123', -1001234)
    expect(result.ok).toBe(false)
  })
})
