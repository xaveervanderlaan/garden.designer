import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MAX_BODY_BYTES } from '../src/proposals/bridgeProtocol.ts'
import { startBridge, type Bridge, type BridgeOptions } from './server.ts'
import { FAKE_CLAUDE, fakeRuns, isAlive, waitFor } from './test/helpers.ts'
import { call, type CallOptions } from './test/http.ts'

const CODE = 'ABCDEFGHJK'
const ORIGIN = 'https://garden.example'

let dir: string
let log: string
let lines: string[]
let bridge: Bridge | undefined
let clockMs: number

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'garden-server-test-'))
  log = join(dir, 'runs.jsonl')
  lines = []
  clockMs = Date.UTC(2026, 10, 17, 12)
})
afterEach(async () => {
  await bridge?.close()
  bridge = undefined
  await rm(dir, { recursive: true, force: true })
})

async function start(
  fake: Record<string, string> = {},
  opts: Partial<BridgeOptions> = {},
): Promise<number> {
  bridge = await startBridge({
    port: 0,
    code: CODE,
    model: 'sonnet',
    origins: [ORIGIN],
    command: FAKE_CLAUDE,
    timeoutMs: 30_000,
    env: { ...process.env, FAKE_CLAUDE_LOG: log, ...fake },
    log: (line) => lines.push(line),
    now: () => clockMs,
    ...opts,
  })
  return bridge.port
}

function headers(port: number, extra: Record<string, string> = {}): Record<string, string> {
  return {
    Host: `127.0.0.1:${port}`,
    Origin: ORIGIN,
    Authorization: 'Bearer abcde-fghjk',
    ...extra,
  }
}

function generate(port: number, body: unknown, opts: CallOptions = {}) {
  return call(port, {
    method: 'POST',
    path: '/generate',
    headers: headers(port, { 'Content-Type': 'application/json' }),
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ...opts,
  })
}

describe('bridge server', () => {
  it('refuses requests without an allowed origin', async () => {
    const port = await start()
    for (const origin of [undefined, 'https://evil.example', `${ORIGIN}.evil.example`, 'null']) {
      const h = headers(port)
      if (origin) h.Origin = origin
      else delete h.Origin
      const res = await call(port, { headers: h })
      expect(res.status).toBe(403)
      expect(res.headers['access-control-allow-origin']).toBeUndefined()
      expect(JSON.parse(res.body)).toEqual({ error: 'forbidden' })
    }
    expect(fakeRuns(log)).toHaveLength(0)
  })

  it('refuses a wrong Host header', async () => {
    const port = await start()
    for (const host of ['evil.example', `evil.example:${port}`, '127.0.0.1:1', `[::1]:${port}`]) {
      const res = await call(port, { headers: headers(port, { Host: host }) })
      expect(res.status).toBe(403)
    }
    const ok = await call(port, { headers: headers(port, { Host: `localhost:${port}` }) })
    expect(ok.status).toBe(200)
  })

  it('answers a preflight with CORS and private network headers', async () => {
    const port = await start()
    const res = await call(port, {
      method: 'OPTIONS',
      path: '/generate',
      headers: {
        Host: `127.0.0.1:${port}`,
        Origin: ORIGIN,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization, content-type',
        'Access-Control-Request-Private-Network': 'true',
      },
    })
    expect(res.status).toBe(204)
    expect(res.headers).toMatchObject({
      'access-control-allow-origin': ORIGIN,
      vary: 'Origin',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'Authorization, Content-Type',
      'access-control-allow-private-network': 'true',
      'access-control-max-age': '600',
    })
    const blocked = await call(port, {
      method: 'OPTIONS',
      headers: { Host: `127.0.0.1:${port}`, Origin: 'https://evil.example' },
    })
    expect(blocked.status).toBe(403)
    expect(blocked.headers['access-control-allow-private-network']).toBeUndefined()
  })

  it('refuses a wrong code and locks after too many', async () => {
    const port = await start()
    const attempt = (auth?: string) => {
      const h = headers(port)
      if (auth) h.Authorization = auth
      else delete h.Authorization
      return call(port, { headers: h })
    }
    expect((await attempt()).status).toBe(401)
    for (let i = 0; i < 9; i++) {
      const res = await attempt('Bearer WRONGCODE0')
      expect(res.status).toBe(401)
      expect(res.headers['access-control-allow-origin']).toBe(ORIGIN)
      expect(JSON.parse(res.body)).toEqual({ error: 'unauthorized' })
    }
    // Ten wrong codes within a minute: even the right one is refused for a minute.
    const locked = await attempt()
    expect(locked.status).toBe(429)
    expect(JSON.parse(locked.body)).toEqual({ error: 'tooManyAttempts' })
    expect((await call(port, { headers: headers(port) })).status).toBe(429)
    clockMs += 61_000
    expect((await call(port, { headers: headers(port) })).status).toBe(200)
  })

  it('health reports readiness and the default model', async () => {
    const port = await start({}, { model: 'opus' })
    const res = await call(port, { headers: headers(port) })
    expect(res.status).toBe(200)
    expect(res.headers['cache-control']).toBe('no-store')
    expect(JSON.parse(res.body)).toEqual({
      app: 'garden-designer-bridge',
      protocol: 1,
      ready: true,
      claudeVersion: '2.1.326',
      model: 'opus',
      models: ['sonnet', 'opus'],
      maxConcurrent: 3,
    })
    expect((await call(port, { path: '/nope', headers: headers(port) })).status).toBe(404)
    const wrongMethod = await call(port, { method: 'POST', headers: headers(port) })
    expect(wrongMethod.status).toBe(405)
  })

  it('generate returns the text and passes shell characters verbatim', async () => {
    const port = await start()
    const prompt = `$(touch ${join(dir, 'pwned')}); \`id\` && echo 'a' "b" | cat > /dev/null \\ %PATH% ✓\n`
    const res = await generate(port, { prompt, model: 'opus' })
    expect(res.status).toBe(200)
    expect(JSON.parse(res.body)).toEqual({
      text: `answer:${prompt.length}`,
      model: 'opus',
      durationMs: 12,
      usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 5 },
    })
    const [run] = fakeRuns(log)
    expect(run?.stdin).toBe(prompt)
    expect(run?.argv).not.toContain(prompt)
    expect(run?.argv[run.argv.indexOf('--model') + 1]).toBe('opus')
    expect(fakeRuns(log)).toHaveLength(1)

    const wrongType = await generate(port, { prompt }, { headers: headers(port) })
    expect(wrongType.status).toBe(400)
    expect((await generate(port, '{not json')).status).toBe(400)
    expect((await generate(port, { prompt: '' })).status).toBe(400)
  })

  it('rejects a body over the limit', async () => {
    const port = await start()
    const res = await generate(port, { prompt: 'x'.repeat(MAX_BODY_BYTES) })
    expect(res.status).toBe(413)
    expect(JSON.parse(res.body)).toEqual({ error: 'tooLarge' })
    const prompt = await generate(port, { prompt: 'x'.repeat(400_001) })
    expect(prompt.status).toBe(413)
    expect(fakeRuns(log)).toHaveLength(0)
  })

  it('rejects an unknown model', async () => {
    const port = await start()
    const res = await generate(port, { prompt: 'p', model: 'haiku --dangerously-skip-permissions' })
    expect(res.status).toBe(400)
    expect(JSON.parse(res.body)).toEqual({ error: 'badRequest' })
    expect(fakeRuns(log)).toHaveLength(0)
  })

  it('allows at most 3 runs at a time', async () => {
    const port = await start({ FAKE_CLAUDE_MODE: 'slow', FAKE_CLAUDE_DELAY_MS: '1500' })
    const first = [1, 2, 3].map((n) => generate(port, { prompt: `p${n}` }))
    await waitFor(() => fakeRuns(log).length === 3)
    const fourth = await generate(port, { prompt: 'p4' })
    expect(fourth.status).toBe(429)
    expect(JSON.parse(fourth.body)).toEqual({ error: 'busy' })
    expect((await Promise.all(first)).map((r) => r.status)).toEqual([200, 200, 200])
    expect(fakeRuns(log)).toHaveLength(3)
  })

  it('stops claude when the app disconnects', async () => {
    const port = await start({ FAKE_CLAUDE_MODE: 'slow', FAKE_CLAUDE_DELAY_MS: '20000' })
    const controller = new AbortController()
    const pending = generate(port, { prompt: 'p' }, { signal: controller.signal })
    await waitFor(() => fakeRuns(log).length === 1)
    controller.abort()
    await expect(pending).rejects.toThrow()
    const pid = fakeRuns(log)[0]?.pid ?? 0
    await waitFor(() => !isAlive(pid))
    await waitFor(() => lines.some((line) => line.includes('closed cancelled')))
  })

  it('reports not logged in and usage limit', async () => {
    let port = await start({ FAKE_CLAUDE_LOGGED_IN: '0', FAKE_CLAUDE_MODE: 'notLoggedIn' })
    const health = JSON.parse((await call(port, { headers: headers(port) })).body)
    expect(health).toMatchObject({ ready: false, reason: 'notLoggedIn' })
    const res = await generate(port, { prompt: 'p' })
    expect(res.status).toBe(503)
    expect(JSON.parse(res.body)).toMatchObject({ error: 'notLoggedIn' })
    await bridge?.close()

    port = await start({ FAKE_CLAUDE_MODE: 'usageLimit' })
    const limit = await generate(port, { prompt: 'p' })
    expect(limit.status).toBe(503)
    expect(JSON.parse(limit.body)).toEqual({
      error: 'usageLimit',
      detail: 'Claude usage limit reached',
    })
    await bridge?.close()

    port = await start({}, { command: [join(dir, 'no-claude')] })
    const missing = JSON.parse((await call(port, { headers: headers(port) })).body)
    expect(missing).toMatchObject({ ready: false, reason: 'notInstalled', claudeVersion: null })
  })

  it('never logs the prompt', async () => {
    const port = await start()
    const secret = 'Garden of Mrs Example at Secret Lane 12'
    expect((await generate(port, { prompt: secret })).status).toBe(200)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/^\d\d:\d\d:\d\d POST \/generate sonnet 1KB → 200 in \d+\.\ds$/)
    expect(lines.join('\n')).not.toContain('Secret')
    expect(lines.join('\n')).not.toContain('answer:')
  })
})
