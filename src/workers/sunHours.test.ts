import { describe, expect, it, vi } from 'vitest'
import { gridForBounds, type SunHoursInput } from '../geometry/sunHours'
import { treeCaster } from '../geometry/shadows'
import { createSunHoursClient, type SunHoursWorker } from './sunHoursClient'
import { createSunHoursHandler, type HandlerOptions } from './sunHoursHandler'
import type { SunHoursRequest, SunHoursResponse } from './sunHoursProtocol'

const input: SunHoursInput = {
  casters: [treeCaster({ x: 0, y: 0 }, 4, 8)],
  grid: gridForBounds({ minX: -10, minY: -10, maxX: 10, maxY: 10 }, 0.5),
  location: { lat: 52.37, lng: 4.9 },
  northAngleDeg: 0,
  days: { kind: 'date', date: { year: 2026, month: 6, day: 21 } },
}

function recordingHandler(options?: HandlerOptions) {
  const messages: SunHoursResponse[] = []
  const transfers: Transferable[][] = []
  const handle = createSunHoursHandler((message, transfer) => {
    messages.push(message)
    transfers.push(transfer)
  }, options)
  return { handle, messages, transfers }
}

/** Runs the real handler in the same thread, delivering messages asynchronously like a worker. */
class FakeWorker extends EventTarget {
  posted: SunHoursRequest[] = []
  terminated = false
  private handle = createSunHoursHandler(
    (message) => {
      if (!this.terminated) this.dispatchEvent(new MessageEvent('message', { data: message }))
    },
    { sliceMs: 0 },
  )
  postMessage(message: SunHoursRequest) {
    this.posted.push(message)
    setTimeout(() => void this.handle(message), 0)
  }
  terminate() {
    this.terminated = true
  }
}

describe('sun-hours worker handler', () => {
  it('reports progress and posts the result, transferring its buffer', async () => {
    const { handle, messages, transfers } = recordingHandler()
    await handle({ type: 'start', jobId: 7, input })
    const done = messages.at(-1)
    expect(done).toMatchObject({ type: 'done', jobId: 7, result: { days: 1 } })
    if (done?.type !== 'done') throw new Error('not done')
    expect(done.result.hours).toHaveLength(40 * 40)
    expect(transfers.at(-1)).toEqual([done.result.hours.buffer])
    const progress = messages.filter((m) => m.type === 'progress')
    expect(progress.length).toBeGreaterThan(10)
    expect(progress.length).toBeLessThanOrEqual(101)
    expect(progress.at(-1)).toEqual({ type: 'progress', jobId: 7, fraction: 1 })
  })

  it('stops a job when it is cancelled', async () => {
    const { handle, messages } = recordingHandler({ sliceMs: 0 })
    const running = handle({ type: 'start', jobId: 1, input })
    await handle({ type: 'cancel', jobId: 1 })
    await running
    expect(messages.at(-1)).toEqual({ type: 'cancelled', jobId: 1 })
    expect(messages.some((m) => m.type === 'done')).toBe(false)
  })

  it('reports errors', async () => {
    const { handle, messages } = recordingHandler()
    await handle({
      type: 'start',
      jobId: 2,
      input: { ...input, grid: { ...input.grid, cellM: -1 } },
    })
    expect(messages).toEqual([{ type: 'error', jobId: 2, message: 'Invalid sun-hours grid' }])
  })
})

describe('sun-hours client', () => {
  it('computes in the worker and reports progress', async () => {
    const worker = new FakeWorker()
    const client = createSunHoursClient(() => worker as unknown as SunHoursWorker)
    const onProgress = vi.fn()
    const result = await client.compute(input, { onProgress })
    expect(result.hours).toHaveLength(1600)
    expect(onProgress).toHaveBeenLastCalledWith(1)
    // The worker is reused for the next job.
    await client.compute(input)
    expect(worker.posted.map((m) => [m.type, m.jobId])).toEqual([
      ['start', 1],
      ['start', 2],
    ])
    client.dispose()
    expect(worker.terminated).toBe(true)
  })

  it('cancels a job when its signal is aborted', async () => {
    const worker = new FakeWorker()
    const client = createSunHoursClient(() => worker as unknown as SunHoursWorker)
    const controller = new AbortController()
    const computing = client.compute(input, { signal: controller.signal })
    controller.abort()
    await expect(computing).rejects.toMatchObject({ name: 'AbortError' })
    expect(worker.posted.at(-1)).toEqual({ type: 'cancel', jobId: 1 })
    // Already aborted: nothing is started.
    await expect(client.compute(input, { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(worker.posted).toHaveLength(2)
  })

  it('rejects running jobs when the worker fails or is disposed', async () => {
    const workers: FakeWorker[] = []
    const client = createSunHoursClient(() => {
      workers.push(new FakeWorker())
      return workers.at(-1)! as unknown as SunHoursWorker
    })
    const failing = client.compute(input)
    workers[0]!.dispatchEvent(new ErrorEvent('error', { message: 'Failed to load' }))
    await expect(failing).rejects.toThrow('Failed to load')
    expect(workers[0]!.terminated).toBe(true)

    const disposed = client.compute(input)
    expect(workers).toHaveLength(2) // a fresh worker after the failure
    client.dispose()
    await expect(disposed).rejects.toMatchObject({ name: 'AbortError' })
  })
})
