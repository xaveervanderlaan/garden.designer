import { z } from 'zod'
import {
  BRIDGE_APP,
  BRIDGE_ERRORS,
  BRIDGE_MODELS,
  BRIDGE_PROTOCOL,
  type BridgeErrorCode,
  type GenerateRequest,
  type GenerateResponse,
  type HealthResponse,
} from './bridgeProtocol'

/** Why a request to the local bridge did not give an answer, as the app explains it. */
export type BridgeFailure =
  | 'notRunning'
  | 'blocked'
  | 'notPaired'
  | 'tooManyAttempts'
  | 'notInstalled'
  | 'notLoggedIn'
  | 'usageLimit'
  | 'busy'
  | 'timeout'
  | 'tooLarge'
  | 'claudeFailed'
  | 'badResponse'
  | 'cancelled'

/** Failures that stop a whole run; the others fail only the request that met them. */
export const ABORT_RUN_FAILURES: ReadonlySet<BridgeFailure> = new Set<BridgeFailure>([
  'notRunning',
  'blocked',
  'notPaired',
  'tooManyAttempts',
  'notInstalled',
  'notLoggedIn',
  'usageLimit',
])

export class BridgeError extends Error {
  readonly failure: BridgeFailure
  readonly detail?: string
  constructor(failure: BridgeFailure, detail?: string) {
    super(detail ? `${failure}: ${detail}` : failure)
    this.name = 'BridgeError'
    this.failure = failure
    if (detail !== undefined) this.detail = detail
  }
}

const modelSchema = z.enum(BRIDGE_MODELS)

const healthSchema = z.object({
  app: z.literal(BRIDGE_APP),
  protocol: z.literal(BRIDGE_PROTOCOL),
  ready: z.boolean(),
  reason: z.enum(['notInstalled', 'notLoggedIn']).optional(),
  claudeVersion: z.string().nullable(),
  model: modelSchema,
  models: z.array(modelSchema),
  maxConcurrent: z.number(),
})

const generateSchema = z.object({
  text: z.string(),
  model: modelSchema,
  durationMs: z.number(),
  usage: z
    .object({ inputTokens: z.number(), outputTokens: z.number(), cacheReadTokens: z.number() })
    .optional(),
})

const errorSchema = z.object({ error: z.enum(BRIDGE_ERRORS), detail: z.string().optional() })

const FAILURE_BY_CODE: Record<BridgeErrorCode, BridgeFailure> = {
  badRequest: 'badResponse',
  // A readable 403 means the Host check refused us (an origin refusal has no CORS headers).
  forbidden: 'blocked',
  unauthorized: 'notPaired',
  tooManyAttempts: 'tooManyAttempts',
  notFound: 'badResponse',
  tooLarge: 'tooLarge',
  busy: 'busy',
  notInstalled: 'notInstalled',
  notLoggedIn: 'notLoggedIn',
  usageLimit: 'usageLimit',
  timeout: 'timeout',
  claudeFailed: 'claudeFailed',
}

function failureForStatus(status: number): BridgeFailure {
  if (status === 401) return 'notPaired'
  if (status === 403) return 'blocked'
  if (status === 413) return 'tooLarge'
  if (status === 429) return 'busy'
  if (status === 504) return 'timeout'
  return 'badResponse'
}

/** The pairing code as the bridge compares it: no spaces or dashes, upper case. */
export function normaliseBridgeCode(code: string): string {
  return code.replace(/[\s-]+/g, '').toUpperCase()
}

/** The address without trailing slashes. */
export function normaliseBridgeAddress(address: string): string {
  return address.trim().replace(/\/+$/, '')
}

export type BridgeClient = {
  health(signal?: AbortSignal): Promise<HealthResponse>
  generate(request: GenerateRequest, signal?: AbortSignal): Promise<GenerateResponse>
}

const isAbort = (error: unknown) => error instanceof Error && error.name === 'AbortError'

export function createBridgeClient(options: {
  address: string
  code: string
  fetchFn?: typeof fetch
}): BridgeClient {
  const base = normaliseBridgeAddress(options.address)
  const auth = `Bearer ${normaliseBridgeCode(options.code)}`
  const fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init))

  /** A request that never reached the bridge: is it not running, or did the browser block it? */
  async function unreachable(signal?: AbortSignal): Promise<BridgeError> {
    if (signal?.aborted) return new BridgeError('cancelled')
    try {
      await fetchFn(`${base}/health`, { mode: 'no-cors', signal: signal ?? null })
      return new BridgeError('blocked')
    } catch (error) {
      if (signal?.aborted || isAbort(error)) return new BridgeError('cancelled')
      return new BridgeError('notRunning')
    }
  }

  async function request<T>(
    path: string,
    body: GenerateRequest | null,
    schema: z.ZodType<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    let response: Response
    try {
      response = await fetchFn(`${base}${path}`, {
        method: body ? 'POST' : 'GET',
        headers: body
          ? { Authorization: auth, 'Content-Type': 'application/json' }
          : { Authorization: auth },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: signal ?? null,
      })
    } catch (error) {
      if (signal?.aborted || isAbort(error)) throw new BridgeError('cancelled')
      throw await unreachable(signal)
    }
    let json: unknown
    try {
      json = await response.json()
    } catch (error) {
      if (signal?.aborted || isAbort(error)) throw new BridgeError('cancelled')
      json = undefined
    }
    if (!response.ok) {
      const parsed = errorSchema.safeParse(json)
      if (!parsed.success) throw new BridgeError(failureForStatus(response.status))
      throw new BridgeError(FAILURE_BY_CODE[parsed.data.error], parsed.data.detail)
    }
    const parsed = schema.safeParse(json)
    if (!parsed.success) throw new BridgeError('badResponse')
    return parsed.data
  }

  return {
    health: (signal) => request('/health', null, healthSchema, signal),
    generate: (req, signal) => request('/generate', req, generateSchema, signal),
  }
}
