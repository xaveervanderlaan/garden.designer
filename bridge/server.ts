// The bridge's HTTP server: localhost only, for allowed origins with the pairing code.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import {
  BRIDGE_APP,
  BRIDGE_MODELS,
  BRIDGE_PROTOCOL,
  isBridgeModel,
  MAX_BODY_BYTES,
  MAX_CONCURRENT,
  MAX_PROMPT_CHARS,
  type BridgeErrorCode,
  type BridgeModel,
  type GenerateResponse,
  type HealthResponse,
} from '../src/proposals/bridgeProtocol.ts'
import { checkClaude, runClaude, type ClaudeCheck } from './claude.ts'
import { codesMatch, normaliseCode } from './pairing.ts'

/** Wrong codes allowed within `LOCKOUT_WINDOW_MS` before the bridge stops accepting any. */
export const MAX_FAILED_ATTEMPTS = 10
export const LOCKOUT_WINDOW_MS = 60_000
export const LOCKOUT_MS = 60_000
/** How long a Claude Code check stays fresh for /health. */
export const CHECK_MAX_AGE_MS = 60_000

export type BridgeOptions = {
  /** 0 picks a free port (tests). */
  port: number
  /** The normalised pairing code. */
  code: string
  model: BridgeModel
  /** Exact origins (scheme://host[:port]) allowed to call the bridge. */
  origins: string[]
  /** The Claude Code executable plus any leading arguments. */
  command: string[]
  timeoutMs: number
  env?: NodeJS.ProcessEnv
  log?: (line: string) => void
  now?: () => number
}

export type Bridge = { port: number; close(): Promise<void> }

const STATUS: Record<BridgeErrorCode, number> = {
  badRequest: 400,
  forbidden: 403,
  unauthorized: 401,
  tooManyAttempts: 429,
  notFound: 404,
  tooLarge: 413,
  busy: 429,
  notInstalled: 503,
  notLoggedIn: 503,
  usageLimit: 503,
  timeout: 504,
  claudeFailed: 502,
}

class RequestError extends Error {
  readonly code: BridgeErrorCode
  readonly status: number
  constructor(code: BridgeErrorCode, status = STATUS[code]) {
    super(code)
    this.code = code
    this.status = status
  }
}

/** What the log line may say about a request: never its text. */
type RequestInfo = { model?: BridgeModel; promptKB?: number; error?: string }
const infos = new WeakMap<ServerResponse, RequestInfo>()
function infoOf(res: ServerResponse): RequestInfo {
  let info = infos.get(res)
  if (!info) {
    info = {}
    infos.set(res, info)
  }
  return info
}

/** The path without a query string (which the log never shows). */
function pathOf(req: IncomingMessage): string {
  return (req.url ?? '').split('?')[0] ?? ''
}

function clock(ms: number): string {
  return new Date(ms).toTimeString().slice(0, 8)
}

export function startBridge(opts: BridgeOptions): Promise<Bridge> {
  const now = opts.now ?? Date.now
  const log = opts.log ?? ((line: string) => console.log(line))
  const origins = new Set(opts.origins)
  const running = new Set<AbortController>()
  let failures: number[] = []
  let lockedUntil = 0
  let check: { at: number; result: Promise<ClaudeCheck> } | null = null
  let port = opts.port

  function claudeCheck(): Promise<ClaudeCheck> {
    if (!check || now() - check.at > CHECK_MAX_AGE_MS) {
      check = { at: now(), result: checkClaude(opts.command, opts.env) }
    }
    return check.result
  }

  function sendJson(res: ServerResponse, status: number, body: unknown) {
    if (res.headersSent || res.destroyed) return
    const text = JSON.stringify(body)
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Length': Buffer.byteLength(text),
    })
    res.end(text)
  }

  function sendError(res: ServerResponse, error: RequestError, detail?: string) {
    infoOf(res).error = error.code
    sendJson(res, error.status, detail ? { error: error.code, detail } : { error: error.code })
  }

  /** The Bearer code, with the lockout after too many wrong ones. */
  function authorise(req: IncomingMessage) {
    const t = now()
    if (t < lockedUntil) throw new RequestError('tooManyAttempts')
    const match = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? '')
    if (match?.[1] && codesMatch(normaliseCode(match[1]), opts.code)) return
    failures = failures.filter((at) => t - at < LOCKOUT_WINDOW_MS)
    failures.push(t)
    if (failures.length >= MAX_FAILED_ATTEMPTS) {
      lockedUntil = t + LOCKOUT_MS
      failures = []
    }
    throw new RequestError('unauthorized')
  }

  /** Reads at most `MAX_BODY_BYTES`; a bigger body is drained, not kept, and refused. */
  function readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const declared = Number(req.headers['content-length'] ?? 0)
      if (declared > MAX_BODY_BYTES) {
        req.resume()
        reject(new RequestError('tooLarge'))
        return
      }
      const chunks: Buffer[] = []
      let size = 0
      let tooLarge = false
      req.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (tooLarge) return
        if (size > MAX_BODY_BYTES) {
          tooLarge = true
          chunks.length = 0
          reject(new RequestError('tooLarge'))
        } else chunks.push(chunk)
      })
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      req.on('error', reject)
    })
  }

  async function health(res: ServerResponse) {
    const result = await claudeCheck()
    const body: HealthResponse = {
      app: BRIDGE_APP,
      protocol: BRIDGE_PROTOCOL,
      ready: result.installed && result.loggedIn,
      claudeVersion: result.version,
      model: opts.model,
      models: [...BRIDGE_MODELS],
      maxConcurrent: MAX_CONCURRENT,
    }
    if (!result.installed) body.reason = 'notInstalled'
    else if (!result.loggedIn) body.reason = 'notLoggedIn'
    sendJson(res, 200, body)
  }

  async function generate(req: IncomingMessage, res: ServerResponse) {
    const type = req.headers['content-type'] ?? ''
    if (!/^application\/json\s*(;|$)/i.test(type)) throw new RequestError('badRequest')
    const text = await readBody(req)
    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      throw new RequestError('badRequest')
    }
    const { prompt, model } = (typeof body === 'object' && body !== null ? body : {}) as Record<
      string,
      unknown
    >
    if (typeof prompt !== 'string' || prompt.length === 0) throw new RequestError('badRequest')
    if (prompt.length > MAX_PROMPT_CHARS) throw new RequestError('tooLarge')
    if (model !== undefined && !isBridgeModel(model)) throw new RequestError('badRequest')
    const runModel = model ?? opts.model
    infoOf(res).model = runModel
    infoOf(res).promptKB = Math.ceil(Buffer.byteLength(prompt) / 1024)
    if (running.size >= MAX_CONCURRENT) throw new RequestError('busy')

    const controller = new AbortController()
    running.add(controller)
    // The app went away (cancelled or closed): stop Claude.
    res.on('close', () => {
      if (!res.writableFinished) controller.abort()
    })
    try {
      const outcome = await runClaude({
        command: opts.command,
        prompt,
        model: runModel,
        timeoutMs: opts.timeoutMs,
        signal: controller.signal,
        env: opts.env,
      })
      if (outcome.ok) {
        const answer: GenerateResponse = {
          text: outcome.text,
          model: runModel,
          durationMs: outcome.durationMs,
          ...(outcome.usage ? { usage: outcome.usage } : {}),
        }
        sendJson(res, 200, answer)
      } else if (outcome.error === 'cancelled') {
        infoOf(res).error = 'cancelled'
      } else {
        // Login or install may have changed: check again on the next /health.
        if (outcome.error === 'notLoggedIn' || outcome.error === 'notInstalled') check = null
        sendError(res, new RequestError(outcome.error), outcome.detail)
      }
    } finally {
      running.delete(controller)
    }
  }

  function logRequest(req: IncomingMessage, res: ServerResponse, started: number) {
    // Method, path, model and prompt size only: never the prompt or the answer.
    const info = infoOf(res)
    const parts = [clock(started), req.method ?? '?', pathOf(req)]
    if (info.model) parts.push(info.model)
    if (info.promptKB !== undefined) parts.push(`${info.promptKB}KB`)
    const status = res.headersSent ? String(res.statusCode) : 'closed'
    const outcome = info.error ? `${status} ${info.error}` : status
    const seconds = ((now() - started) / 1000).toFixed(1)
    log(`${parts.join(' ')} → ${outcome} in ${seconds}s`)
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    // Host: only our own address, against DNS rebinding.
    const host = req.headers.host
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) {
      throw new RequestError('forbidden')
    }
    // Origin: only the app. No CORS headers for anyone else, so their pages can't read answers.
    const origin = req.headers.origin
    if (!origin || !origins.has(origin)) throw new RequestError('forbidden')
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    // Chrome's Private Network Access: a public site may call this local address.
    res.setHeader('Access-Control-Allow-Private-Network', 'true')
    res.setHeader('Access-Control-Max-Age', '600')
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end()
      return
    }
    authorise(req)
    const path = pathOf(req)
    if (path === '/health') {
      if (req.method !== 'GET') throw new RequestError('badRequest', 405)
      await health(res)
    } else if (path === '/generate') {
      if (req.method !== 'POST') throw new RequestError('badRequest', 405)
      await generate(req, res)
    } else throw new RequestError('notFound')
  }

  const server = createServer((req, res) => {
    const started = now()
    const handled = handle(req, res).catch((error: unknown) => {
      if (error instanceof RequestError) sendError(res, error)
      else {
        infoOf(res).error = 'internal'
        sendJson(res, 500, { error: 'claudeFailed' })
      }
    })
    // Log once the request is both answered (or gone) and fully handled.
    res.on('close', () => void handled.then(() => logRequest(req, res, started)))
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(opts.port, '127.0.0.1', () => {
      server.off('error', reject)
      port = (server.address() as AddressInfo).port
      resolve({
        port,
        close: () =>
          new Promise<void>((done) => {
            for (const controller of running) controller.abort()
            server.close(() => done())
            server.closeAllConnections()
          }),
      })
    })
  })
}
