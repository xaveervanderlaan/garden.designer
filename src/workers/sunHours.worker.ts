import { createSunHoursHandler } from './sunHoursHandler'
import type { SunHoursRequest, SunHoursResponse } from './sunHoursProtocol'

/**
 * Web Worker that computes sun-hours maps off the main thread (PLAN M12). Start it through
 * sunHoursClient.ts; the protocol is in sunHoursProtocol.ts.
 */

// The app is type-checked with the DOM library, not WebWorker's, so describe the scope we use.
type WorkerScope = {
  postMessage(message: SunHoursResponse, transfer: Transferable[]): void
  onmessage: ((event: MessageEvent<SunHoursRequest>) => void) | null
}

const scope = self as unknown as WorkerScope
const handle = createSunHoursHandler((message, transfer) => scope.postMessage(message, transfer))
scope.onmessage = (event) => void handle(event.data)
