import type { SunHoursInput, SunHoursResult } from '../geometry/sunHours'
import type { SunHoursRequest, SunHoursResponse } from './sunHoursProtocol'

/**
 * Runs sun-hours computations in a Web Worker (sunHours.worker.ts), so the UI doesn't freeze.
 * One worker is started on first use and reused; `dispose()` stops it.
 *
 *     const client = createSunHoursClient()
 *     const controller = new AbortController()
 *     const result = await client.compute(input, { onProgress, signal: controller.signal })
 *
 * Aborting the signal cancels the job in the worker and rejects with the signal's reason (an
 * AbortError unless another reason was given).
 */

export type SunHoursClient = {
  compute(
    input: SunHoursInput,
    options?: { onProgress?: (fraction: number) => void; signal?: AbortSignal },
  ): Promise<SunHoursResult>
  /** Stops the worker; running jobs reject with an AbortError. */
  dispose(): void
}

/** The parts of a Worker the client uses (tests pass a fake). */
export type SunHoursWorker = Pick<Worker, 'postMessage' | 'terminate'> & {
  addEventListener(type: 'message', listener: (event: MessageEvent<SunHoursResponse>) => void): void
  addEventListener(type: 'error', listener: (event: ErrorEvent) => void): void
}

export function startSunHoursWorker(): SunHoursWorker {
  return new Worker(new URL('./sunHours.worker.ts', import.meta.url), { type: 'module' })
}

type Job = {
  resolve: (result: SunHoursResult) => void
  reject: (reason: unknown) => void
  onProgress?: (fraction: number) => void
}

const abortError = () => new DOMException('The sun-hours computation was cancelled', 'AbortError')

export function createSunHoursClient(
  startWorker: () => SunHoursWorker = startSunHoursWorker,
): SunHoursClient {
  let worker: SunHoursWorker | null = null
  let nextJobId = 1
  const jobs = new Map<number, Job>()

  function rejectAll(reason: unknown) {
    const pending = [...jobs.values()]
    jobs.clear()
    for (const job of pending) job.reject(reason)
  }

  function ensureWorker(): SunHoursWorker {
    if (worker) return worker
    const started = startWorker()
    started.addEventListener('message', (event) => {
      const message = event.data
      const job = jobs.get(message.jobId)
      if (!job) return // cancelled meanwhile
      switch (message.type) {
        case 'progress':
          job.onProgress?.(message.fraction)
          break
        case 'done':
          jobs.delete(message.jobId)
          job.resolve(message.result)
          break
        case 'cancelled':
          jobs.delete(message.jobId)
          job.reject(abortError())
          break
        case 'error':
          jobs.delete(message.jobId)
          job.reject(new Error(message.message))
          break
      }
    })
    started.addEventListener('error', (event) => {
      // The worker itself failed (e.g. it couldn't load): start a fresh one next time.
      if (worker === started) worker = null
      started.terminate()
      rejectAll(new Error(event.message || 'The sun-hours worker failed'))
    })
    worker = started
    return started
  }

  function post(message: SunHoursRequest) {
    ensureWorker().postMessage(message)
  }

  return {
    compute(input, { onProgress, signal } = {}) {
      if (signal?.aborted) return Promise.reject(signal.reason)
      const jobId = nextJobId++
      return new Promise<SunHoursResult>((resolve, reject) => {
        const onAbort = () => {
          if (!jobs.delete(jobId)) return
          worker?.postMessage({ type: 'cancel', jobId } satisfies SunHoursRequest)
          reject(signal!.reason)
        }
        const settle =
          <T>(fn: (value: T) => void) =>
          (value: T) => {
            signal?.removeEventListener('abort', onAbort)
            fn(value)
          }
        jobs.set(jobId, { resolve: settle(resolve), reject: settle(reject), onProgress })
        signal?.addEventListener('abort', onAbort)
        post({ type: 'start', jobId, input })
      })
    },
    dispose() {
      worker?.terminate()
      worker = null
      rejectAll(abortError())
    },
  }
}
