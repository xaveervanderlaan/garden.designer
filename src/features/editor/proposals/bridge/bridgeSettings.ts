import { useSyncExternalStore } from 'react'
import { z } from 'zod'
import {
  BRIDGE_DEFAULT_PORT,
  BRIDGE_MODELS,
  type BridgeModel,
} from '../../../../proposals/bridgeProtocol'

/**
 * Pairing with the local bridge (M21): a setting of this browser, not of a design, so it lives in
 * its own localStorage entry. An empty `code` means "not paired" (the address and model are kept).
 */

const KEY = 'garden-designer.bridge'

export const DEFAULT_BRIDGE_ADDRESS = `http://127.0.0.1:${BRIDGE_DEFAULT_PORT}`
export const DEFAULT_BRIDGE_MODEL: BridgeModel = 'sonnet'

const settingsSchema = z.object({
  address: z.string(),
  code: z.string(),
  model: z.enum(BRIDGE_MODELS),
})

export type BridgeSettings = z.infer<typeof settingsSchema>

const listeners = new Set<() => void>()
let cached: { raw: string | null; value: BridgeSettings | null } | null = null

function readRaw(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

/** The saved settings, or null when there are none (or they can't be read). */
export function loadBridgeSettings(): BridgeSettings | null {
  const raw = readRaw()
  if (cached && cached.raw === raw) return cached.value
  let value: BridgeSettings | null = null
  if (raw !== null) {
    try {
      const parsed = settingsSchema.safeParse(JSON.parse(raw))
      value = parsed.success ? parsed.data : null
    } catch {
      value = null
    }
  }
  cached = { raw, value }
  return value
}

export function saveBridgeSettings(settings: BridgeSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settingsSchema.parse(settings)))
  } catch (error) {
    console.warn('Saving the bridge settings failed', error)
  }
  for (const listener of listeners) listener()
}

/** Unpairs: removes the code, keeps the address and model. */
export function forgetBridgeCode(): void {
  const settings = loadBridgeSettings()
  if (settings) saveBridgeSettings({ ...settings, code: '' })
}

/** True when the settings are complete enough to talk to the bridge. */
export const isPaired = (settings: BridgeSettings | null): settings is BridgeSettings =>
  !!settings && settings.code.trim() !== '' && settings.address.trim() !== ''

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The settings, re-rendering when they are saved. */
export function useBridgeSettings(): BridgeSettings | null {
  return useSyncExternalStore(subscribe, loadBridgeSettings)
}
