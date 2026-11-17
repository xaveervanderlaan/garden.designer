import { createSunHoursClient, type SunHoursClient } from '../../../workers/sunHoursClient'
import type { Project } from '../../../model/schema'
import { resetSunMap, setSunMapAbort, useSunMapStore } from '../../../store/sunMapStore'
import { type SunMapRequest, sunMapInput, sunMapKey } from './sunMap'

let client: SunHoursClient | null = null
let controller: AbortController | null = null

const getClient = () => (client ??= createSunHoursClient())

/** Tests replace the worker client (null: back to the real one). */
export function setSunHoursClientForTests(next: SunHoursClient | null) {
  client = next
}

const isAbort = (error: unknown) => error instanceof DOMException && error.name === 'AbortError'

/**
 * Computes the map for a request in the worker. A running job is aborted first; the previous
 * result stays until the new one is done. Without a plot nothing happens.
 */
export async function computeSunMap(project: Project, request: SunMapRequest): Promise<void> {
  const input = sunMapInput(project, request)
  if (!input) return
  controller?.abort()
  const mine = new AbortController()
  controller = mine
  const set = useSunMapStore.setState
  set({ status: 'running', progress: 0, error: null })
  try {
    const result = await getClient().compute(input, {
      signal: mine.signal,
      onProgress: (progress) => {
        if (controller === mine) set({ progress })
      },
    })
    if (controller !== mine) return
    set({ status: 'done', progress: 1, result, key: sunMapKey(input), request })
  } catch (error) {
    if (controller !== mine) return
    if (isAbort(error)) {
      set({ status: useSunMapStore.getState().result ? 'done' : 'idle', progress: 0 })
    } else {
      set({ status: 'error', error: error instanceof Error ? error.message : String(error) })
    }
  } finally {
    if (controller === mine) controller = null
  }
}

/** Stops a running computation (the previous result, if any, stays). */
export function cancelSunMap() {
  controller?.abort()
}

/** Aborts a running job and forgets the map. */
export function clearSunMap() {
  resetSunMap()
}

setSunMapAbort(() => {
  controller?.abort()
  controller = null
})

export function setSunMapVisible(visible: boolean) {
  useSunMapStore.setState({ visible })
}
