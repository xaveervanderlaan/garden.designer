// Shared between the app and the local bridge (`bridge/`), which imports this file directly with
// Node's type stripping: keep it free of imports and of non-erasable TypeScript syntax.

export const BRIDGE_APP = 'garden-designer-bridge'
export const BRIDGE_PROTOCOL = 1
export const BRIDGE_DEFAULT_PORT = 7387

export const BRIDGE_MODELS = ['sonnet', 'opus'] as const
export type BridgeModel = (typeof BRIDGE_MODELS)[number]

/** Longest prompt the bridge accepts, in characters. */
export const MAX_PROMPT_CHARS = 400_000
/** Largest request body the bridge reads, in bytes. */
export const MAX_BODY_BYTES = 2_000_000
/** Claude runs the bridge allows at the same time. */
export const MAX_CONCURRENT = 3

export const BRIDGE_ERRORS = [
  'badRequest',
  'forbidden',
  'unauthorized',
  'tooManyAttempts',
  'notFound',
  'tooLarge',
  'busy',
  'notInstalled',
  'notLoggedIn',
  'usageLimit',
  'timeout',
  'claudeFailed',
] as const
export type BridgeErrorCode = (typeof BRIDGE_ERRORS)[number]

export type HealthResponse = {
  app: typeof BRIDGE_APP
  protocol: 1
  ready: boolean
  reason?: 'notInstalled' | 'notLoggedIn'
  claudeVersion: string | null
  model: BridgeModel
  models: BridgeModel[]
  maxConcurrent: number
}

export type GenerateRequest = { prompt: string; model?: BridgeModel }

export type GenerateResponse = {
  text: string
  model: BridgeModel
  durationMs: number
  usage?: { inputTokens: number; outputTokens: number; cacheReadTokens: number }
}

export type BridgeErrorResponse = { error: BridgeErrorCode; detail?: string }

export function isBridgeModel(value: unknown): value is BridgeModel {
  return typeof value === 'string' && (BRIDGE_MODELS as readonly string[]).includes(value)
}
