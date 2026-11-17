/**
 * Copies text to the clipboard. False when that isn't allowed (then the caller selects the text so
 * it can be copied by hand).
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
