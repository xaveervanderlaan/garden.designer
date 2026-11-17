import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CODE_ALPHABET,
  codesMatch,
  formatCode,
  loadOrCreateCode,
  newPairingCode,
  normaliseCode,
} from './pairing.ts'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'garden-pairing-test-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('pairing code', () => {
  it('makes a 10-character code', () => {
    const code = newPairingCode()
    expect(code).toHaveLength(10)
    expect([...code].every((c) => CODE_ALPHABET.includes(c))).toBe(true)
    expect(newPairingCode(() => new Uint8Array(10).fill(31))).toBe('ZZZZZZZZZZ')
    expect(formatCode('ABCDEFGHJK')).toBe('ABCDE-FGHJK')
  })

  it('normalises dashes, spaces and case', () => {
    expect(normaliseCode(' abcde-fghjk ')).toBe('ABCDEFGHJK')
    expect(normaliseCode('ABCDE FGHJK')).toBe('ABCDEFGHJK')
    expect(codesMatch(normaliseCode('abcde-fghjk'), 'ABCDEFGHJK')).toBe(true)
    expect(codesMatch('ABCDEFGHJK', 'ABCDEFGHJ0')).toBe(false)
    expect(codesMatch('ABC', 'ABCDEFGHJK')).toBe(false)
  })

  it('keeps the code between starts', async () => {
    const first = await loadOrCreateCode(dir)
    expect(await loadOrCreateCode(dir)).toBe(first)
  })

  it('new code replaces it', async () => {
    const first = await loadOrCreateCode(dir)
    const second = await loadOrCreateCode(dir, { renew: true })
    expect(second).not.toBe(first)
    expect(await loadOrCreateCode(dir)).toBe(second)
  })

  it('stores the file private', async () => {
    const configDir = join(dir, 'garden-designer')
    await loadOrCreateCode(configDir)
    expect((await stat(configDir)).mode & 0o777).toBe(0o700)
    expect((await stat(join(configDir, 'bridge.json'))).mode & 0o777).toBe(0o600)
  })
})
