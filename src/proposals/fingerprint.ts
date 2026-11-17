/** A short, stable hash (FNV-1a, 32 bit, hex) of a value's JSON: for cache keys, not security. */
export function fingerprint(value: unknown): string {
  const text = JSON.stringify(value) ?? ''
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}
