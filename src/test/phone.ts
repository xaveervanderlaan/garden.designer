import { vi } from 'vitest'

/** Makes `matchMedia` report a phone screen (or not). Undo with `vi.unstubAllGlobals()`. */
export function mockPhoneScreen(matches: boolean): void {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches,
    media,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}
