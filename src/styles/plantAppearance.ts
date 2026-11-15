import { plantRadiusM } from '../model/plants'
import type { Plant } from '../model/schema'
import { type SymbolPart, darken, plantSymbol, symbolColors } from './plantSymbols'

/**
 * What a planting looks like on the plan: its size and its symbol. Everything that draws plants
 * (the plan, placement previews, later the PDF export) goes through plantAppearance, so the
 * growth view (M13: size per year) and the seasonal view (M14: colours per month) only have to
 * change it here, via `PlantView`.
 */

/** View settings that change how plants look. Empty for now: M13 adds a year, M14 a month. */
export type PlantView = Record<never, never>

export type PlantAppearance = {
  radiusM: number
  /** Symbol in a unit circle (see plantSymbols.ts), drawn when it is big enough on screen. */
  parts: readonly SymbolPart[]
  /** Fill and outline of the simple disc drawn instead when zoomed out. */
  color: string
  outline: string
}

const UNKNOWN_COLOR = '#b8bdb3'

/** A plant that can't be found (e.g. a deleted custom plant): a plain grey disc. */
const UNKNOWN: Omit<PlantAppearance, 'radiusM'> = {
  parts: [
    {
      d: 'M -0.92 0 A 0.92 0.92 0 1 0 0.92 0 A 0.92 0.92 0 1 0 -0.92 0 Z',
      fill: UNKNOWN_COLOR,
      stroke: darken(UNKNOWN_COLOR, 0.4),
      strokeWidth: 1,
    },
  ],
  color: UNKNOWN_COLOR,
  outline: darken(UNKNOWN_COLOR, 0.4),
}

const cache = new WeakMap<Plant, PlantAppearance>()

export function plantAppearance(plant: Plant | undefined, _view: PlantView = {}): PlantAppearance {
  if (!plant) return { ...UNKNOWN, radiusM: plantRadiusM(undefined) }
  const cached = cache.get(plant)
  if (cached) return cached
  const colors = symbolColors(plant)
  const appearance: PlantAppearance = {
    radiusM: plantRadiusM(plant),
    parts: plantSymbol(plant, colors),
    color: colors.main,
    outline: darken(colors.main, 0.35),
  }
  cache.set(plant, appearance)
  return appearance
}
