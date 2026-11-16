/** Why a write to the browser's storage (IndexedDB) failed: no space left, or something else. */
export type StorageFailure = 'full' | 'failed'

const MAX_DEPTH = 4

/**
 * True if the error, or an error it wraps (Dexie's `inner`, a standard `cause`), is a
 * QuotaExceededError: the browser refused the write because its storage for this site is full.
 */
export function isQuotaExceeded(error: unknown): boolean {
  let pending: unknown[] = [error]
  for (let depth = 0; depth <= MAX_DEPTH && pending.length > 0; depth++) {
    const next: unknown[] = []
    for (const item of pending) {
      if (typeof item !== 'object' || item === null) continue
      const { name, inner, cause } = item as { name?: unknown; inner?: unknown; cause?: unknown }
      if (name === 'QuotaExceededError') return true
      next.push(inner, cause)
    }
    pending = next
  }
  return false
}

export function storageFailure(error: unknown): StorageFailure {
  return isQuotaExceeded(error) ? 'full' : 'failed'
}
