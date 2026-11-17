import { create } from 'zustand'
import type { SunHoursResult } from '../geometry/sunHours'
import type { SunMapRequest } from '../features/editor/sunmap/sunMap'

/**
 * The computed sun-hours map (M12): view state, never saved or undone, and cleared when a design
 * opens. `key` identifies the input the result was computed from (see sunMapKey).
 */
export type SunMapStatus = 'idle' | 'running' | 'done' | 'error'

export type SunMapState = {
  status: SunMapStatus
  /** 0..1 while running. */
  progress: number
  result: SunHoursResult | null
  /** Input key of `result`. */
  key: string | null
  /** What `result` was computed for (day, cell size, growth year). */
  request: SunMapRequest | null
  /** Show the heatmap on the plan. */
  visible: boolean
  error: string | null
}

const initial: SunMapState = {
  status: 'idle',
  progress: 0,
  result: null,
  key: null,
  request: null,
  visible: true,
  error: null,
}

export const useSunMapStore = create<SunMapState>(() => ({ ...initial }))

let abortRunning: (() => void) | null = null

/** sunMapActions registers how to stop a running job, so resetting can abort it. */
export function setSunMapAbort(abort: (() => void) | null) {
  abortRunning = abort
}

/** Back to nothing computed; a running job is aborted. */
export function resetSunMap() {
  abortRunning?.()
  useSunMapStore.setState({ ...initial })
}
