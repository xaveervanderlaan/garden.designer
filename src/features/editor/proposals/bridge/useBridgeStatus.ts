import { useEffect, useState } from 'react'
import {
  BridgeError,
  type BridgeFailure,
  createBridgeClient,
} from '../../../../proposals/bridgeClient'
import type { HealthResponse } from '../../../../proposals/bridgeProtocol'
import { type BridgeSettings, isPaired, useBridgeSettings } from './bridgeSettings'

/** How long a health check may take before the bridge counts as not running. */
export const HEALTH_TIMEOUT_MS = 5000

export type BridgeStatus = {
  state: 'off' | 'checking' | 'ready' | 'error'
  settings: BridgeSettings | null
  health?: HealthResponse
  failure?: BridgeFailure
  recheck: () => void
}

/** Asks the bridge for its health; a timeout counts as not running. */
export async function checkBridge(
  settings: Pick<BridgeSettings, 'address' | 'code'>,
  signal?: AbortSignal,
): Promise<HealthResponse> {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, HEALTH_TIMEOUT_MS)
  const stop = () => controller.abort()
  signal?.addEventListener('abort', stop, { once: true })
  try {
    return await createBridgeClient(settings).health(controller.signal)
  } catch (error) {
    if (timedOut) throw new BridgeError('notRunning')
    throw error
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', stop)
  }
}

/**
 * Whether one-click generation can be offered. Only asks the bridge when it has been paired, so a
 * browser without a bridge set up makes no requests to it.
 */
export function useBridgeStatus(): BridgeStatus {
  const settings = useBridgeSettings()
  const paired = isPaired(settings)
  const address = settings?.address ?? ''
  const code = settings?.code ?? ''
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{
    key: string
    health?: HealthResponse
    failure?: BridgeFailure
  } | null>(null)
  const key = `${attempt}\n${address}\n${code}`

  useEffect(() => {
    if (!paired) return
    const controller = new AbortController()
    checkBridge({ address, code }, controller.signal).then(
      (health) => {
        if (controller.signal.aborted) return
        setResult(
          health.ready
            ? { key, health }
            : { key, health, failure: health.reason ?? 'notInstalled' },
        )
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        setResult({ key, failure: error instanceof BridgeError ? error.failure : 'notRunning' })
      },
    )
    return () => controller.abort()
  }, [paired, address, code, key])

  const recheck = () => setAttempt((n) => n + 1)
  if (!paired) return { state: 'off', settings, recheck }
  if (result?.key !== key) return { state: 'checking', settings, recheck }
  return {
    state: result.failure ? 'error' : 'ready',
    settings,
    ...(result.health ? { health: result.health } : {}),
    ...(result.failure ? { failure: result.failure } : {}),
    recheck,
  }
}
