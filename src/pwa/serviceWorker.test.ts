import { afterEach, describe, expect, it, vi } from 'vitest'
import { SKIP_WAITING, createUpdater } from './serviceWorker'

class FakeWorker extends EventTarget {
  messages: unknown[] = []
  state: ServiceWorkerState
  constructor(state: ServiceWorkerState) {
    super()
    this.state = state
  }
  postMessage(message: unknown) {
    this.messages.push(message)
  }
  becomes(state: ServiceWorkerState) {
    this.state = state
    this.dispatchEvent(new Event('statechange'))
  }
}

class FakeRegistration extends EventTarget {
  installing: FakeWorker | null = null
  waiting: FakeWorker | null = null
  update = vi.fn(() => Promise.resolve())
  /** The browser found a new service worker and starts installing it. */
  found(worker: FakeWorker) {
    this.installing = worker
    this.dispatchEvent(new Event('updatefound'))
  }
}

class FakeContainer extends EventTarget {
  registration = new FakeRegistration()
  register = vi.fn(() => Promise.resolve(this.registration))
  controller: FakeWorker | null
  constructor(controller: FakeWorker | null) {
    super()
    this.controller = controller
  }
}

function setup({ controlled = true, checkEveryMs = 0 } = {}) {
  const container = new FakeContainer(controlled ? new FakeWorker('activated') : null)
  const reload = vi.fn()
  const beforeReload = vi.fn(() => Promise.resolve())
  const updater = createUpdater({
    container: container as unknown as ServiceWorkerContainer,
    url: '/garden.designer/sw.js',
    scope: '/garden.designer/',
    checkEveryMs,
    beforeReload,
    reload,
  })
  return { container, registration: container.registration, updater, reload, beforeReload }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('service worker updates', () => {
  it('registers the worker for the app’s scope', async () => {
    const { container, updater } = setup()
    await updater.start()
    expect(container.register).toHaveBeenCalledWith('/garden.designer/sw.js', {
      scope: '/garden.designer/',
    })
  })

  it('does not offer an update on the first install', async () => {
    const { registration, updater } = setup({ controlled: false })
    await updater.start()
    const worker = new FakeWorker('installing')
    registration.found(worker)
    worker.becomes('installed')
    expect(updater.getSnapshot()).toBe(false)
  })

  it('offers an update when a new version has installed', async () => {
    const { registration, updater } = setup()
    const listener = vi.fn()
    updater.subscribe(listener)
    await updater.start()

    const worker = new FakeWorker('installing')
    registration.found(worker)
    expect(updater.getSnapshot()).toBe(false)
    worker.becomes('installed')
    expect(updater.getSnapshot()).toBe(true)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('offers an update that was already waiting when the app started', async () => {
    const { registration, updater } = setup()
    registration.waiting = new FakeWorker('installed')
    await updater.start()
    expect(updater.getSnapshot()).toBe(true)
  })

  it('saves, activates the waiting version and reloads once it has taken over', async () => {
    const { container, registration, updater, reload, beforeReload } = setup()
    const waiting = new FakeWorker('installed')
    registration.waiting = waiting
    await updater.start()

    await updater.applyUpdate()
    expect(beforeReload).toHaveBeenCalled()
    expect(waiting.messages).toEqual([SKIP_WAITING])
    expect(reload).not.toHaveBeenCalled()

    container.dispatchEvent(new Event('controllerchange'))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('just reloads when another tab already activated the new version', async () => {
    const { updater, reload } = setup()
    await updater.start()
    await updater.applyUpdate()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('keeps working without offline support when registering fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { container, updater } = setup()
    container.register.mockRejectedValueOnce(new DOMException('Not allowed', 'SecurityError'))
    await updater.start()
    expect(warn).toHaveBeenCalled()
    expect(updater.getSnapshot()).toBe(false)
  })

  it('checks for a new version every hour, ignoring failures', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const { registration, updater } = setup({ checkEveryMs: 60 * 60 * 1000 })
    registration.update.mockRejectedValue(new TypeError('Failed to fetch'))
    await updater.start()

    vi.advanceTimersByTime(60 * 60 * 1000)
    expect(registration.update).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(60 * 60 * 1000)
    expect(registration.update).toHaveBeenCalledTimes(2)
  })
})
