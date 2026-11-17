import { describe, expect, it, vi } from 'vitest'
import { BridgeError, createBridgeClient, type BridgeFailure } from './bridgeClient'
import { BRIDGE_APP, type HealthResponse } from './bridgeProtocol'

const HEALTH: HealthResponse = {
  app: BRIDGE_APP,
  protocol: 1,
  ready: true,
  claudeVersion: '2.1.326',
  model: 'sonnet',
  models: ['sonnet', 'opus'],
  maxConcurrent: 3,
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function client(fetchFn: typeof fetch) {
  return createBridgeClient({ address: 'http://127.0.0.1:7387/', code: 'abcde-fghjk', fetchFn })
}

async function failureOf(promise: Promise<unknown>): Promise<BridgeFailure> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(BridgeError)
  return (error as BridgeError).failure
}

describe('createBridgeClient', () => {
  it('sends the code as a bearer token', async () => {
    const fetchFn = vi.fn<typeof fetch>(async (input) =>
      String(input).endsWith('/health')
        ? json(200, HEALTH)
        : json(200, { text: 'hi', model: 'opus', durationMs: 5 }),
    )
    const c = client(fetchFn)
    expect(await c.health()).toEqual(HEALTH)
    expect(await c.generate({ prompt: 'p', model: 'opus' })).toEqual({
      text: 'hi',
      model: 'opus',
      durationMs: 5,
    })
    const [healthUrl, healthInit] = fetchFn.mock.calls[0]!
    expect(healthUrl).toBe('http://127.0.0.1:7387/health')
    expect(healthInit?.method).toBe('GET')
    expect(healthInit?.headers).toEqual({ Authorization: 'Bearer ABCDEFGHJK' })
    const [url, init] = fetchFn.mock.calls[1]!
    expect(url).toBe('http://127.0.0.1:7387/generate')
    expect(init?.method).toBe('POST')
    expect(init?.headers).toEqual({
      Authorization: 'Bearer ABCDEFGHJK',
      'Content-Type': 'application/json',
    })
    expect(JSON.parse(String(init?.body))).toEqual({ prompt: 'p', model: 'opus' })
  })

  it('maps statuses to failures', async () => {
    const cases: [number, unknown, BridgeFailure][] = [
      [401, { error: 'unauthorized' }, 'notPaired'],
      [429, { error: 'tooManyAttempts' }, 'tooManyAttempts'],
      [429, { error: 'busy' }, 'busy'],
      [413, { error: 'tooLarge' }, 'tooLarge'],
      [503, { error: 'notInstalled' }, 'notInstalled'],
      [503, { error: 'notLoggedIn' }, 'notLoggedIn'],
      [503, { error: 'usageLimit', detail: 'You hit your limit' }, 'usageLimit'],
      [504, { error: 'timeout' }, 'timeout'],
      [502, { error: 'claudeFailed' }, 'claudeFailed'],
      [400, { error: 'badRequest' }, 'badResponse'],
      [403, { error: 'forbidden' }, 'blocked'],
      [401, 'not json', 'notPaired'],
      [504, null, 'timeout'],
      [500, { whatever: 1 }, 'badResponse'],
    ]
    for (const [status, body, failure] of cases) {
      const c = client(async () =>
        typeof body === 'string' ? new Response(body, { status }) : json(status, body),
      )
      expect(await failureOf(c.generate({ prompt: 'p' })), `${status} ${String(body)}`).toBe(
        failure,
      )
    }
    const c = client(async () => json(503, { error: 'usageLimit', detail: 'You hit your limit' }))
    await expect(c.generate({ prompt: 'p' })).rejects.toMatchObject({
      detail: 'You hit your limit',
    })
  })

  it('tells a stopped bridge from a blocked request', async () => {
    const stopped = client(async () => {
      throw new TypeError('Failed to fetch')
    })
    expect(await failureOf(stopped.health())).toBe('notRunning')

    const probes: RequestInit[] = []
    const blocked = client(async (_input, init) => {
      if (init?.mode === 'no-cors') {
        probes.push(init)
        return new Response(null, { status: 200 })
      }
      throw new TypeError('Failed to fetch')
    })
    expect(await failureOf(blocked.generate({ prompt: 'p' }))).toBe('blocked')
    expect(probes).toHaveLength(1)
    // The probe carries no code.
    expect(probes[0]!.headers).toBeUndefined()
  })

  it('cancels with the signal', async () => {
    const controller = new AbortController()
    const c = client(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          )
        }),
    )
    const pending = c.generate({ prompt: 'p' }, controller.signal)
    controller.abort()
    expect(await failureOf(pending)).toBe('cancelled')
  })

  it('rejects a response that is not the bridge', async () => {
    for (const body of [
      { ...HEALTH, app: 'something-else' },
      { ...HEALTH, protocol: 2 },
      { hello: 'world' },
    ]) {
      expect(await failureOf(client(async () => json(200, body)).health())).toBe('badResponse')
    }
    const html = client(async () => new Response('<html></html>', { status: 200 }))
    expect(await failureOf(html.health())).toBe('badResponse')
    const noText = client(async () => json(200, { model: 'sonnet', durationMs: 1 }))
    expect(await failureOf(noText.generate({ prompt: 'p' }))).toBe('badResponse')
  })
})
