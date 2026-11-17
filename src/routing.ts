import { useMemo, useSyncExternalStore } from 'react'

/**
 * Minimal hash-based router. Hash URLs work on GitHub Pages without server-side
 * fallbacks: `#/` is the project list, `#/p/<id>` opens a project in the editor.
 */
export type Route =
  | { name: 'projects' }
  | { name: 'editor'; projectId: string }
  | { name: 'viewer'; projectId: string }
  | { name: 'notFound' }

const EDITOR_PATH = /^\/p\/([^/]+)\/?$/
const VIEWER_PATH = /^\/v\/([^/]+)\/?$/

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '')
  if (path === '' || path === '/') return { name: 'projects' }

  for (const [pattern, name] of [
    [EDITOR_PATH, 'editor'],
    [VIEWER_PATH, 'viewer'],
  ] as const) {
    const match = pattern.exec(path)
    if (match?.[1]) {
      try {
        return { name, projectId: decodeURIComponent(match[1]) }
      } catch {
        return { name: 'notFound' } // malformed percent-encoding
      }
    }
  }
  return { name: 'notFound' }
}

export function hrefFor(route: Exclude<Route, { name: 'notFound' }>): string {
  switch (route.name) {
    case 'projects':
      return '#/'
    case 'editor':
      return `#/p/${encodeURIComponent(route.projectId)}`
    case 'viewer':
      return `#/v/${encodeURIComponent(route.projectId)}`
  }
}

/** Goes to a route without adding a history entry (the back button skips the redirecting one). */
export function replaceRoute(route: Exclude<Route, { name: 'notFound' }>): void {
  window.location.replace(hrefFor(route))
}

export function navigate(route: Exclude<Route, { name: 'notFound' }>): void {
  window.location.hash = hrefFor(route)
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

const getHash = () => window.location.hash

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, getHash)
  return useMemo(() => parseHash(hash), [hash])
}
