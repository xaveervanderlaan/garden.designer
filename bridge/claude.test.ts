import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { classifyFailure, claudeArgs, checkClaude, parseResult, runClaude } from './claude.ts'
import { FAKE_CLAUDE, fakeRuns, isAlive, waitFor } from './test/helpers.ts'

let dir: string
let log: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'garden-claude-test-'))
  log = join(dir, 'runs.jsonl')
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

function env(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { ...process.env, FAKE_CLAUDE_LOG: log, ...extra }
}

describe('claude', () => {
  it('parses the JSON result', () => {
    const stdout = JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: 'hello',
      duration_ms: 1500,
      usage: { input_tokens: 10, output_tokens: 3, cache_read_input_tokens: 7 },
    })
    expect(parseResult(stdout)).toEqual({
      isError: false,
      text: 'hello',
      durationMs: 1500,
      usage: { inputTokens: 10, outputTokens: 3, cacheReadTokens: 7 },
    })
    expect(parseResult(`warning\n${stdout}\n`)?.text).toBe('hello')
    expect(parseResult(JSON.stringify({ subtype: 'error_max_turns', result: 'x' }))?.isError).toBe(
      true,
    )
    expect(parseResult('not json')).toBeNull()
    expect(parseResult('{"type":"result"}')).toBeNull()
  })

  it('classifies login and usage errors', () => {
    expect(classifyFailure('Not logged in · Please run /login')).toBe('notLoggedIn')
    expect(classifyFailure('Invalid API key')).toBe('notLoggedIn')
    expect(classifyFailure('Claude AI usage limit reached|1700000000')).toBe('usageLimit')
    expect(classifyFailure("You've hit your limit · resets 5pm")).toBe('usageLimit')
    expect(classifyFailure('Something else broke')).toBe('claudeFailed')
  })

  it('passes the prompt on stdin with no tools', async () => {
    const prompt = 'Design a garden; "quotes" $(echo no) `ls` \n second line ✓'
    const outcome = await runClaude({
      command: FAKE_CLAUDE,
      prompt,
      model: 'sonnet',
      timeoutMs: 10_000,
      env: env(),
    })
    expect(outcome).toEqual({
      ok: true,
      text: `answer:${prompt.length}`,
      durationMs: 12,
      usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 5 },
    })
    const [run] = fakeRuns(log)
    expect(run?.stdin).toBe(prompt)
    expect(run?.argv).toEqual(claudeArgs('sonnet'))
    expect(run?.argv.join(' ')).not.toContain('Design a garden')
    const tools = run?.argv.indexOf('--tools') ?? -1
    expect(run?.argv[tools + 1]).toBe('')
    expect(run?.argv).toContain('--safe-mode')
  })

  it('reports failures', async () => {
    const run = (mode: string) =>
      runClaude({
        command: FAKE_CLAUDE,
        prompt: 'p',
        model: 'opus',
        timeoutMs: 10_000,
        env: env({ FAKE_CLAUDE_MODE: mode }),
      })
    expect(await run('notLoggedIn')).toMatchObject({ ok: false, error: 'notLoggedIn' })
    expect(await run('usageLimit')).toMatchObject({ ok: false, error: 'usageLimit' })
    expect(await run('garbage')).toMatchObject({ ok: false, error: 'claudeFailed' })
    expect(
      await runClaude({
        command: [join(dir, 'missing')],
        prompt: 'p',
        model: 'opus',
        timeoutMs: 1000,
      }),
    ).toEqual({ ok: false, error: 'notInstalled' })
  })

  it('kills claude after the timeout', async () => {
    const started = Date.now()
    const outcome = await runClaude({
      command: FAKE_CLAUDE,
      prompt: 'p',
      model: 'sonnet',
      timeoutMs: 1000,
      env: env({ FAKE_CLAUDE_MODE: 'slow', FAKE_CLAUDE_DELAY_MS: '20000' }),
    })
    expect(outcome).toEqual({ ok: false, error: 'timeout' })
    expect(Date.now() - started).toBeLessThan(5000)
    const [run] = fakeRuns(log)
    expect(run && isAlive(run.pid)).toBe(false)
  })

  it('kills claude when aborted', async () => {
    const controller = new AbortController()
    const pending = runClaude({
      command: FAKE_CLAUDE,
      prompt: 'p',
      model: 'sonnet',
      timeoutMs: 60_000,
      signal: controller.signal,
      env: env({ FAKE_CLAUDE_MODE: 'slow', FAKE_CLAUDE_DELAY_MS: '20000' }),
    })
    await waitFor(() => fakeRuns(log).length === 1)
    controller.abort()
    expect(await pending).toEqual({ ok: false, error: 'cancelled' })
    expect(isAlive(fakeRuns(log)[0]?.pid ?? 0)).toBe(false)
  })

  it('checks the version and login', async () => {
    expect(await checkClaude(FAKE_CLAUDE, env())).toEqual({
      installed: true,
      version: '2.1.326',
      loggedIn: true,
    })
    expect(await checkClaude(FAKE_CLAUDE, env({ FAKE_CLAUDE_LOGGED_IN: '0' }))).toMatchObject({
      loggedIn: false,
    })
    expect(await checkClaude([join(dir, 'missing')])).toEqual({
      installed: false,
      version: null,
      loggedIn: false,
    })
  })
})
