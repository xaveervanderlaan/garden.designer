import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import { isQuotaExceeded, storageFailure } from './storageErrors'

describe('storage errors', () => {
  it('recognises a QuotaExceededError', () => {
    const error = new DOMException('full', 'QuotaExceededError')
    expect(isQuotaExceeded(error)).toBe(true)
    expect(storageFailure(error)).toBe('full')
  })

  it('looks inside wrapped Dexie errors', () => {
    const quota = new DOMException('full', 'QuotaExceededError')
    const abort = new Dexie.AbortError('Transaction aborted', quota)
    expect(isQuotaExceeded(abort)).toBe(true)
    expect(isQuotaExceeded(new Error('outer', { cause: abort }))).toBe(true)
    expect(storageFailure({ inner: { cause: { name: 'QuotaExceededError' } } })).toBe('full')
  })

  it('treats anything else as a failed write', () => {
    expect(storageFailure(new Error('disk on fire'))).toBe('failed')
    expect(storageFailure(new Dexie.ConstraintError('duplicate key'))).toBe('failed')
    expect(storageFailure(undefined)).toBe('failed')
    expect(storageFailure('QuotaExceededError')).toBe('failed')
    // Not followed forever
    let deep: unknown = new DOMException('full', 'QuotaExceededError')
    for (let i = 0; i < 10; i++) deep = { inner: deep }
    expect(storageFailure(deep)).toBe('failed')
  })
})
