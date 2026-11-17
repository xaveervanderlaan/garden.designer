import { useProjectStore } from '../store/projectStore'

/**
 * Registers the service worker that makes the app work offline (built by vite-plugin-pwa, see
 * scripts/vite-pwa.ts) and tracks whether a new version is waiting. A new version never takes over
 * by itself: the user chooses to reload (UpdatePrompt), which saves pending changes first.
 */
export type Updater = {
  /** Registers the service worker and starts watching for new versions. */
  start(): Promise<void>
  /** True once a new version is installed and waiting for the user to reload. */
  getSnapshot(): boolean
  subscribe(listener: () => void): () => void
  /** Saves pending changes, lets the waiting version take over and reloads the page. */
  applyUpdate(): Promise<void>
}

type UpdaterOptions = {
  container: ServiceWorkerContainer
  url: string
  scope: string
  /** How often an open app checks for a new version; browsers also check on each page load. */
  checkEveryMs?: number
  beforeReload?: () => Promise<void>
  reload?: () => void
}

/** The message the generated service worker listens for to stop waiting and take over. */
export const SKIP_WAITING = { type: 'SKIP_WAITING' } as const

const HOUR_MS = 60 * 60 * 1000

export function createUpdater({
  container,
  url,
  scope,
  checkEveryMs = HOUR_MS,
  beforeReload,
  reload = () => window.location.reload(),
}: UpdaterOptions): Updater {
  let registration: ServiceWorkerRegistration | undefined
  let updateReady = false
  let applying = false
  const listeners = new Set<() => void>()

  function markUpdateReady() {
    if (updateReady) return
    updateReady = true
    for (const listener of listeners) listener()
  }

  /** A worker that finishes installing while another one controls the page is a new version. */
  function watch(worker: ServiceWorker | null) {
    if (!worker) return
    const check = () => {
      if (worker.state === 'installed' && container.controller) markUpdateReady()
    }
    worker.addEventListener('statechange', check)
    check()
  }

  return {
    async start() {
      try {
        registration = await container.register(url, { scope })
      } catch (error) {
        // E.g. a browser that doesn't allow service workers in a private window.
        console.warn('The app is not available offline: no service worker.', error)
        return
      }
      const reg = registration
      if (!reg) return // e.g. Playwright's blocked service workers resolve with nothing
      if (reg.waiting && container.controller) markUpdateReady()
      watch(reg.installing)
      reg.addEventListener('updatefound', () => watch(reg.installing))
      if (checkEveryMs > 0) {
        setInterval(() => {
          if (navigator.onLine) reg.update().catch(() => {}) // offline or server down: next time
        }, checkEveryMs)
      }
    },

    getSnapshot: () => updateReady,

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    async applyUpdate() {
      if (applying) return
      applying = true
      await beforeReload?.().catch(() => {}) // a failed save shows in the editor; reload anyway
      const waiting = registration?.waiting
      // No waiting worker: another tab already let the new version take over.
      if (!waiting) return reload()
      container.addEventListener('controllerchange', () => reload(), { once: true })
      waiting.postMessage(SKIP_WAITING)
    },
  }
}

/**
 * Starts the service worker in the production build (not in dev or tests) once the page has
 * loaded, so precaching doesn't compete with the app's own start-up. Returns null when there is
 * no service worker.
 */
export function registerServiceWorker(): Updater | null {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return null
  const base = import.meta.env.BASE_URL
  const updater = createUpdater({
    container: navigator.serviceWorker,
    url: `${base}sw.js`,
    scope: base,
    beforeReload: () => useProjectStore.getState().flush(),
  })
  const start = () => void updater.start()
  if (document.readyState === 'complete') start()
  else window.addEventListener('load', start, { once: true })
  return updater
}
