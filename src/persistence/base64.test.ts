import { describe, expect, it } from 'vitest'
import { base64ToBytes, bytesToBase64, fromDataUrl, toDataUrl } from './base64'

describe('base64', () => {
  it('round-trips every byte value', () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i)
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes)
  })

  it('round-trips data larger than one encoding chunk', () => {
    const bytes = Uint8Array.from({ length: 100_003 }, (_, i) => (i * 31) % 256)
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes)
  })

  it('matches the standard encoding', () => {
    expect(bytesToBase64(new TextEncoder().encode('tuin'))).toBe('dHVpbg==')
  })
})

describe('data URLs', () => {
  it('round-trips mime type and bytes', () => {
    const data = new Uint8Array([1, 2, 3, 250]).buffer
    const parsed = fromDataUrl(toDataUrl('image/png', data))
    expect(parsed?.mimeType).toBe('image/png')
    expect(new Uint8Array(parsed!.data)).toEqual(new Uint8Array(data))
  })

  it.each([
    '',
    'data:image/png,abc',
    'data:;base64,AAAA',
    'https://example.com/x.png',
    'data:image/png;base64,@@@',
  ])('rejects %j', (input) => {
    expect(fromDataUrl(input)).toBeUndefined()
  })
})
