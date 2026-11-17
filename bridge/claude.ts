// Runs the Claude Code CLI in print mode: one prompt in, one answer out, no tools.
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { BridgeModel } from '../src/proposals/bridgeProtocol.ts'

/** Replaces Claude Code's own (coding) system prompt: short, so every run starts small. */
export const SYSTEM_PROMPT =
  'You help design gardens. The user message holds the whole task and the answer format. ' +
  'Answer only in that format. You have no tools and cannot ask questions.'

/** How long to wait after SIGTERM before SIGKILL. */
export const KILL_GRACE_MS = 3000
/** More output than any answer needs: stop reading (and fail) beyond this. */
export const MAX_STDOUT_BYTES = 5_000_000
const MAX_STDERR_BYTES = 64_000
const DETAIL_CHARS = 300
const CHECK_TIMEOUT_MS = 15_000

/**
 * Print mode, JSON result, no built-in tools, no MCP servers, no slash commands, no saved
 * session, nothing asks for permission, and no CLAUDE.md, hooks, plugins or skills. The prompt
 * goes on stdin, so it never shows in the process list.
 */
export function claudeArgs(model: BridgeModel): string[] {
  return [
    '-p',
    '--output-format',
    'json',
    '--model',
    model,
    '--tools',
    '',
    '--strict-mcp-config',
    '--disable-slash-commands',
    '--no-session-persistence',
    '--permission-mode',
    'dontAsk',
    '--safe-mode',
    '--system-prompt',
    SYSTEM_PROMPT,
  ]
}

export type ClaudeUsage = { inputTokens: number; outputTokens: number; cacheReadTokens: number }

export type ClaudeFailure =
  'notInstalled' | 'notLoggedIn' | 'usageLimit' | 'timeout' | 'claudeFailed' | 'cancelled'

export type ClaudeOutcome =
  | { ok: true; text: string; durationMs: number; usage?: ClaudeUsage }
  | { ok: false; error: ClaudeFailure; detail?: string }

export type ParsedResult = {
  isError: boolean
  text: string
  durationMs?: number
  usage?: ClaudeUsage
}

function tokens(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/** Reads `--output-format json` output: one result object (the last line if there are more). */
export function parseResult(stdout: string): ParsedResult | null {
  const trimmed = stdout.trim()
  const candidates = [trimmed, trimmed.split('\n').at(-1) ?? '']
  for (const candidate of candidates) {
    let value: unknown
    try {
      value = JSON.parse(candidate)
    } catch {
      continue
    }
    if (typeof value !== 'object' || value === null) continue
    const r = value as Record<string, unknown>
    if (typeof r.result !== 'string') continue
    const isError =
      r.is_error === true || (typeof r.subtype === 'string' && r.subtype !== 'success')
    const parsed: ParsedResult = { isError, text: r.result }
    if (typeof r.duration_ms === 'number') parsed.durationMs = r.duration_ms
    if (typeof r.usage === 'object' && r.usage !== null) {
      const u = r.usage as Record<string, unknown>
      parsed.usage = {
        inputTokens: tokens(u.input_tokens),
        outputTokens: tokens(u.output_tokens),
        cacheReadTokens: tokens(u.cache_read_input_tokens),
      }
    }
    return parsed
  }
  return null
}

export function classifyFailure(text: string): 'notLoggedIn' | 'usageLimit' | 'claudeFailed' {
  if (/not logged in|\/login|invalid api key|authenticat/i.test(text)) return 'notLoggedIn'
  if (/usage limit|hit your limit|limit reached|rate limit/i.test(text)) return 'usageLimit'
  return 'claudeFailed'
}

function detailOf(text: string): string | undefined {
  const trimmed = text.trim()
  return trimmed ? trimmed.slice(0, DETAIL_CHARS) : undefined
}

type Collected = {
  code: number | null
  stdout: string
  stderr: string
  /** Set when the bridge stopped the process itself. */
  stopped?: 'timeout' | 'cancelled' | 'tooMuchOutput'
  notFound?: boolean
  spawnError?: string
}

/** Spawns without a shell (arguments as an array), feeds stdin and collects capped output. */
function runProcess(
  command: string[],
  args: string[],
  opts: {
    input?: string
    cwd?: string
    env?: NodeJS.ProcessEnv
    timeoutMs: number
    signal?: AbortSignal
  },
): Promise<Collected> {
  return new Promise((resolve) => {
    const [cmd, ...pre] = command
    if (!cmd) {
      resolve({ code: null, stdout: '', stderr: '', notFound: true })
      return
    }
    const child = spawn(cmd, [...pre, ...args], {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      shell: false,
      windowsHide: true,
      stdio: 'pipe',
    })
    const out: Buffer[] = []
    const err: Buffer[] = []
    let outBytes = 0
    let errBytes = 0
    let stopped: Collected['stopped']
    let settled = false
    let killTimer: NodeJS.Timeout | undefined

    const stop = (reason: NonNullable<Collected['stopped']>) => {
      if (stopped || settled) return
      stopped = reason
      child.kill('SIGTERM')
      killTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
      }, KILL_GRACE_MS)
      killTimer.unref()
    }
    const onAbort = () => stop('cancelled')
    const timer = setTimeout(() => stop('timeout'), opts.timeoutMs)
    opts.signal?.addEventListener('abort', onAbort, { once: true })

    const finish = (result: Partial<Collected>) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      opts.signal?.removeEventListener('abort', onAbort)
      resolve({
        code: null,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
        stopped,
        ...result,
      })
    }

    child.stdout.on('data', (chunk: Buffer) => {
      outBytes += chunk.length
      if (outBytes > MAX_STDOUT_BYTES) stop('tooMuchOutput')
      else out.push(chunk)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      if (errBytes < MAX_STDERR_BYTES) err.push(chunk)
      errBytes += chunk.length
    })
    child.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') finish({ notFound: true })
      else if (child.pid === undefined) finish({ spawnError: error.message })
    })
    child.on('close', (code) => {
      clearTimeout(killTimer)
      finish({ code })
    })
    // Claude may exit before reading all of stdin; that is not our error to report.
    child.stdin.on('error', () => {})
    child.stdin.end(opts.input ?? '')
    if (opts.signal?.aborted) stop('cancelled')
  })
}

export type RunClaudeOptions = {
  /** The executable plus any leading arguments, e.g. `['claude']`. */
  command: string[]
  prompt: string
  model: BridgeModel
  timeoutMs: number
  signal?: AbortSignal
  env?: NodeJS.ProcessEnv
}

export async function runClaude(opts: RunClaudeOptions): Promise<ClaudeOutcome> {
  const started = Date.now()
  // A fresh empty directory per run: never the repo or the user's home.
  const cwd = await mkdtemp(join(tmpdir(), 'garden-bridge-'))
  try {
    const run = await runProcess(opts.command, claudeArgs(opts.model), {
      input: opts.prompt,
      cwd,
      env: opts.env,
      timeoutMs: opts.timeoutMs,
      signal: opts.signal,
    })
    if (run.notFound) return { ok: false, error: 'notInstalled' }
    if (run.spawnError)
      return { ok: false, error: 'claudeFailed', detail: detailOf(run.spawnError) }
    if (run.stopped === 'cancelled') return { ok: false, error: 'cancelled' }
    if (run.stopped === 'timeout') return { ok: false, error: 'timeout' }
    if (run.stopped === 'tooMuchOutput') {
      return { ok: false, error: 'claudeFailed', detail: 'Claude Code gave too much output.' }
    }
    const parsed = parseResult(run.stdout)
    if (run.code === 0 && parsed && !parsed.isError) {
      return {
        ok: true,
        text: parsed.text,
        durationMs: parsed.durationMs ?? Date.now() - started,
        ...(parsed.usage ? { usage: parsed.usage } : {}),
      }
    }
    if (run.code === 0 && !parsed) {
      return {
        ok: false,
        error: 'claudeFailed',
        detail: 'Claude Code gave output the bridge could not read.',
      }
    }
    // Only error text goes into the detail, never an answer.
    const errorText = [parsed?.isError ? parsed.text : '', run.stderr].filter(Boolean).join('\n')
    return {
      ok: false,
      error: classifyFailure(errorText),
      detail: detailOf(errorText) ?? `Claude Code exited with code ${run.code}.`,
    }
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
}

export type ClaudeCheck = { installed: boolean; version: string | null; loggedIn: boolean }

/** Is Claude Code installed, which version, and is it logged in? */
export async function checkClaude(
  command: string[],
  env?: NodeJS.ProcessEnv,
): Promise<ClaudeCheck> {
  const version = await runProcess(command, ['--version'], { env, timeoutMs: CHECK_TIMEOUT_MS })
  if (version.notFound || version.spawnError || version.code !== 0) {
    return { installed: false, version: null, loggedIn: false }
  }
  const versionText = version.stdout.trim()
  const auth = await runProcess(command, ['auth', 'status', '--json'], {
    env,
    timeoutMs: CHECK_TIMEOUT_MS,
  })
  let loggedIn = auth.code === 0
  try {
    const status: unknown = JSON.parse(auth.stdout)
    const flag = (status as { loggedIn?: unknown } | null)?.loggedIn
    if (typeof flag === 'boolean') loggedIn = flag
  } catch {
    // Not JSON: go by the exit code.
  }
  return {
    installed: true,
    version: /\d+\.\d+\.\d+/.exec(versionText)?.[0] ?? (versionText.split('\n')[0] || null),
    loggedIn,
  }
}
