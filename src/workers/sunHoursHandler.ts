import { computeSunHoursAsync } from '../geometry/sunHours'
import type { SunHoursRequest, SunHoursResponse } from './sunHoursProtocol'

/**
 * The sun-hours worker's message handling as a plain function, so tests can drive it without a
 * real Worker. The computation runs in slices (computeSunHoursAsync), so a cancel message that
 * arrives meanwhile is handled between slices.
 */

export type PostResponse = (message: SunHoursResponse, transfer: Transferable[]) => void

export type HandlerOptions = {
  /** How long to compute before letting messages in (ms). */
  sliceMs?: number
  /** Minimum progress step between progress messages. */
  progressStep?: number
}

/** Returns the handler; it resolves once the request has been dealt with. */
export function createSunHoursHandler(post: PostResponse, options: HandlerOptions = {}) {
  const running = new Map<number, AbortController>()
  const progressStep = options.progressStep ?? 0.01

  async function start(jobId: number, request: Extract<SunHoursRequest, { type: 'start' }>) {
    const controller = new AbortController()
    running.set(jobId, controller)
    let reported = 0
    try {
      const result = await computeSunHoursAsync(request.input, {
        signal: controller.signal,
        sliceMs: options.sliceMs,
        onProgress: (fraction) => {
          if (fraction - reported >= progressStep || (fraction === 1 && reported < 1)) {
            reported = fraction
            post({ type: 'progress', jobId, fraction }, [])
          }
        },
      })
      post({ type: 'done', jobId, result }, [result.hours.buffer])
    } catch (error) {
      if (controller.signal.aborted) post({ type: 'cancelled', jobId }, [])
      else post({ type: 'error', jobId, message: String((error as Error)?.message ?? error) }, [])
    } finally {
      running.delete(jobId)
    }
  }

  return async function handle(request: SunHoursRequest): Promise<void> {
    switch (request.type) {
      case 'start':
        return start(request.jobId, request)
      case 'cancel':
        running.get(request.jobId)?.abort()
        return
    }
  }
}
