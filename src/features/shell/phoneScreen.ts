import { useSyncExternalStore } from 'react'

/** Portrait phones by width, landscape phones by height; tablets and desktops keep the editor. */
export const PHONE_QUERY = '(max-width: 599px), (pointer: coarse) and (max-height: 499px)'

function query(): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia(PHONE_QUERY) : null
}

export function isPhoneScreen(): boolean {
  return query()?.matches ?? false
}

function subscribe(onChange: () => void): () => void {
  const list = query()
  list?.addEventListener('change', onChange)
  return () => list?.removeEventListener('change', onChange)
}

export function usePhoneScreen(): boolean {
  return useSyncExternalStore(subscribe, isPhoneScreen)
}
