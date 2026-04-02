import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'node:path'

// We test the pure data-mapping logic extracted from the command
// by mocking readInstanceInfo and InstanceRegistry

vi.mock('../../cli/commands/status.js', () => ({
  readInstanceInfo: vi.fn(),
}))

vi.mock('../../core/instance/instance-registry.js', () => ({
  InstanceRegistry: vi.fn().mockImplementation(() => ({
    load: vi.fn(),
    list: vi.fn().mockReturnValue([]),
  })),
}))

vi.mock('../../core/instance/instance-context.js', () => ({
  getGlobalRoot: vi.fn().mockReturnValue('/Users/user/.openacp'),
}))

import { buildInstanceListEntries } from '../../cli/commands/instances.js'
import { readInstanceInfo } from '../../cli/commands/status.js'
import { InstanceRegistry } from '../../core/instance/instance-registry.js'

describe('buildInstanceListEntries', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns empty array when no instances registered', async () => {
    const mockRegistry = { load: vi.fn(), list: vi.fn().mockReturnValue([]) }
    vi.mocked(InstanceRegistry).mockImplementation(function() { return mockRegistry } as any)
    const result = await buildInstanceListEntries()
    expect(result).toEqual([])
  })

  it('maps registry entries to InstanceListEntry with correct fields', async () => {
    const mockRegistry = {
      load: vi.fn(),
      list: vi.fn().mockReturnValue([
        { id: 'main', root: '/Users/user/.openacp' },
      ]),
    }
    vi.mocked(InstanceRegistry).mockImplementation(function() { return mockRegistry } as any)
    vi.mocked(readInstanceInfo).mockReturnValue({
      name: 'Main', pid: 1234, apiPort: 21420,
      tunnelPort: null, runMode: 'daemon', channels: [],
    })

    const result = await buildInstanceListEntries()
    expect(result).toEqual([{
      id: 'main',
      name: 'Main',
      directory: '/Users/user',
      root: '/Users/user/.openacp',
      status: 'running',
      port: 21420,
    }])
  })

  it('sets status stopped when pid is null', async () => {
    const mockRegistry = {
      load: vi.fn(),
      list: vi.fn().mockReturnValue([{ id: 'dev', root: '/project/.openacp' }]),
    }
    vi.mocked(InstanceRegistry).mockImplementation(function() { return mockRegistry } as any)
    vi.mocked(readInstanceInfo).mockReturnValue({
      name: 'Dev', pid: null, apiPort: null,
      tunnelPort: null, runMode: null, channels: [],
    })

    const result = await buildInstanceListEntries()
    expect(result[0]!.status).toBe('stopped')
    expect(result[0]!.port).toBeNull()
  })

  it('computes directory as path.dirname(root)', async () => {
    const mockRegistry = {
      load: vi.fn(),
      list: vi.fn().mockReturnValue([
        { id: 'proj', root: '/Users/user/my-project/.openacp' },
      ]),
    }
    vi.mocked(InstanceRegistry).mockImplementation(function() { return mockRegistry } as any)
    vi.mocked(readInstanceInfo).mockReturnValue({
      name: 'Proj', pid: null, apiPort: null,
      tunnelPort: null, runMode: null, channels: [],
    })

    const result = await buildInstanceListEntries()
    expect(result[0]!.directory).toBe('/Users/user/my-project')
    expect(result[0]!.root).toBe('/Users/user/my-project/.openacp')
  })
})
