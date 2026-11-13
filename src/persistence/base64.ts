const CHUNK = 0x8000 // keeps String.fromCharCode's argument list well within engine limits

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

export function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function toDataUrl(mimeType: string, data: ArrayBuffer): string {
  return `data:${mimeType};base64,${bytesToBase64(new Uint8Array(data))}`
}

/** Parses a base64 data URL. Returns undefined when it isn't one. */
export function fromDataUrl(dataUrl: string): { mimeType: string; data: ArrayBuffer } | undefined {
  const match = /^data:([\w.+-]+\/[\w.+-]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(dataUrl)
  if (!match?.[1] || match[2] === undefined) return undefined
  try {
    return { mimeType: match[1], data: base64ToBytes(match[2]).buffer }
  } catch {
    return undefined
  }
}
