import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { importFromDir } from '../plugin-installer.js'

describe('importFromDir', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'plugin-installer-test-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  async function createFakePackage(
    name: string,
    pkgJson: Record<string, any>,
    entryContent = 'export const loaded = true;\n',
  ) {
    const pkgDir = path.join(tmpDir, 'node_modules', ...name.split('/'))
    await fs.mkdir(pkgDir, { recursive: true })
    await fs.writeFile(path.join(pkgDir, 'package.json'), JSON.stringify(pkgJson))

    const entry = pkgJson.exports?.['.']?.import
      ?? pkgJson.exports?.['.']
      ?? pkgJson.main
      ?? 'index.js'
    const entryResolved = typeof entry === 'string' ? entry : 'index.js'
    const entryPath = path.join(pkgDir, entryResolved)
    await fs.mkdir(path.dirname(entryPath), { recursive: true })
    await fs.writeFile(entryPath, entryContent)
  }

  it('resolves ESM package via exports["."].import', async () => {
    await createFakePackage('test-esm', {
      name: 'test-esm',
      type: 'module',
      exports: { '.': { import: './dist/index.js' } },
    })

    const mod = await importFromDir('test-esm', tmpDir)
    expect(mod.loaded).toBe(true)
  })

  it('resolves package via exports["."] string shorthand', async () => {
    await createFakePackage('test-shorthand', {
      name: 'test-shorthand',
      exports: { '.': './lib/main.js' },
    })

    const mod = await importFromDir('test-shorthand', tmpDir)
    expect(mod.loaded).toBe(true)
  })

  it('resolves package via main field', async () => {
    await createFakePackage('test-main', {
      name: 'test-main',
      main: './lib/index.js',
    })

    const mod = await importFromDir('test-main', tmpDir)
    expect(mod.loaded).toBe(true)
  })

  it('falls back to index.js when no exports or main', async () => {
    await createFakePackage('test-fallback', {
      name: 'test-fallback',
    })

    const mod = await importFromDir('test-fallback', tmpDir)
    expect(mod.loaded).toBe(true)
  })

  it('resolves scoped packages', async () => {
    await createFakePackage('@openacp/plugin-discord', {
      name: '@openacp/plugin-discord',
      exports: { '.': { import: './dist/index.js' } },
    })

    const mod = await importFromDir('@openacp/plugin-discord', tmpDir)
    expect(mod.loaded).toBe(true)
  })

  it('throws descriptive error when package.json missing', async () => {
    await expect(importFromDir('nonexistent', tmpDir)).rejects.toThrow(
      /Cannot read package\.json for "nonexistent"/,
    )
  })

  it('throws descriptive error when entry point missing', async () => {
    const pkgDir = path.join(tmpDir, 'node_modules', 'bad-entry')
    await fs.mkdir(pkgDir, { recursive: true })
    await fs.writeFile(
      path.join(pkgDir, 'package.json'),
      JSON.stringify({ name: 'bad-entry', main: './missing.js' }),
    )

    await expect(importFromDir('bad-entry', tmpDir)).rejects.toThrow(
      /Entry point "\.\/missing\.js" not found for "bad-entry"/,
    )
  })
})
