import { type GrowthView, isPlanted, plantSizeAt } from '../model/growth'
import { plantRadiusM } from '../model/plants'
import type { Plant } from '../model/schema'
import { type SeasonState, plantAppearance as seasonAppearance } from '../model/season'
import { PLANT_COLOR_HEX } from './plantColors'
import {
  type SymbolColors,
  type SymbolPart,
  TRUNK_COLOR,
  darken,
  plantSymbol,
  symbolColors,
} from './plantSymbols'

/**
 * What a planting looks like on the plan: its size and its symbol. Everything that draws plants
 * (the plan, placement previews, later the PDF export) goes through plantAppearance, so this is
 * the one place where the growth view (M13: size per year) and the seasonal view (M14: colours per
 * month) change how plants look.
 *
 * - **Year** (`view.year`): plants are drawn at their size in that year (`plantSizeAt`). A planting
 *   that isn't in the ground yet is a *ghost*: drawn see-through at its planting size, with a
 *   dashed outline, so it can still be found and selected.
 * - **Month** (`view.month`, null = the usual look: flower colour for perennials and bulbs, leaf
 *   colour for the rest). The state comes from `model/season.ts`:
 *   - flowering: the whole symbol in the first flower colour;
 *   - leaf / autumn: the symbol in the foliage / autumn colour;
 *   - bare (deciduous woody plants in winter): outlines only, in a twig brown, so the symbol stays
 *     recognisable (a tree keeps its trunk);
 *   - dormant (nothing above ground): the symbol in faint greys.
 */

/** View settings that change how plants look (from the editor's view bar). */
export type PlantView = {
  /** Growth (M13): the size in this calendar year, or the mature size. */
  year: GrowthView
  /** Season (M14): how plants look in this month (1–12), or null for their usual look. */
  month: number | null
}

export const DEFAULT_PLANT_VIEW: PlantView = { year: 'mature', month: null }

export type PlantAppearance = {
  radiusM: number
  /** Symbol in a unit circle (see plantSymbols.ts), drawn when it is big enough on screen. */
  parts: readonly SymbolPart[]
  /** Fill of the simple disc drawn instead when zoomed out; null: an outline only (bare). */
  color: string | null
  outline: string
  /** How the plant looks in the viewed month; null without a month. */
  season: SeasonState | null
  /** Not in the ground yet in the viewed year: drawn see-through with a dashed outline. */
  ghost: boolean
}

/** Colours of the seasonal states that don't come from the plant data. */
export const SEASON_COLORS = {
  /** Outlines of bare branches. */
  bare: '#7a6248',
  /** Faint fill and outline of a dormant plant. */
  dormantFill: '#e3ddd2',
  dormantStroke: '#b3a996',
}

/** A ghost (not planted yet in the viewed year): its opacity and dashed outline. */
export const GHOST_STYLE = { opacity: 0.4, ring: '#6b7566', dashPx: [3, 3] as const }

const UNKNOWN_COLOR = '#b8bdb3'

type Look = Omit<PlantAppearance, 'radiusM' | 'ghost'>

/** A plant that can't be found (e.g. a deleted custom plant): a plain grey disc. */
const UNKNOWN: Look = {
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
  season: null,
}

function coloured(plant: Plant, colors: SymbolColors, season: SeasonState | null): Look {
  return {
    parts: plantSymbol(plant, colors),
    color: colors.main,
    outline: darken(colors.main, 0.35),
    season,
  }
}

/** The plant's look in a month (or its usual look without one). */
function lookOf(plant: Plant, month: number | null): Look {
  if (month === null) return coloured(plant, symbolColors(plant), null)
  const { state, color } = seasonAppearance(plant, month)
  switch (state) {
    case 'flowering':
    case 'leaf':
    case 'autumn': {
      const hex = PLANT_COLOR_HEX[color ?? plant.foliageColor]
      return coloured(plant, { main: hex, foliage: hex }, state)
    }
    case 'bare':
      return {
        // Branches only: outlines without fills. The trunk stays; fruit and the like go.
        parts: plantSymbol(plant).flatMap((part): SymbolPart[] =>
          part.stroke
            ? [{ d: part.d, stroke: SEASON_COLORS.bare, strokeWidth: part.strokeWidth }]
            : part.fill === TRUNK_COLOR
              ? [part]
              : [],
        ),
        color: null,
        outline: SEASON_COLORS.bare,
        season: state,
      }
    case 'dormant':
      return {
        parts: plantSymbol(plant).map((part) => ({
          ...part,
          ...(part.fill ? { fill: SEASON_COLORS.dormantFill } : {}),
          ...(part.stroke ? { stroke: SEASON_COLORS.dormantStroke } : {}),
        })),
        color: SEASON_COLORS.dormantFill,
        outline: SEASON_COLORS.dormantStroke,
        season: state,
      }
  }
}

/** Looks per plant (plants are never changed in place) and month. */
const looks = new WeakMap<Plant, Map<number | null, Look>>()
/** Appearances per plant and month, size and ghost state, so equal inputs give the same object. */
const cache = new WeakMap<Plant, Map<string, PlantAppearance>>()

function cached<K, V>(maps: WeakMap<Plant, Map<K, V>>, plant: Plant, key: K, make: () => V): V {
  let map = maps.get(plant)
  if (!map) {
    map = new Map()
    maps.set(plant, map)
  }
  let value = map.get(key)
  if (value === undefined) {
    value = make()
    map.set(key, value)
  }
  return value
}

/**
 * How a plant is drawn in a view. `plantedYear` is the planting's year; it only matters for a
 * growth year (without it the plant is drawn at its mature size).
 */
export function plantAppearance(
  plant: Plant | undefined,
  view: PlantView = DEFAULT_PLANT_VIEW,
  plantedYear?: number,
): PlantAppearance {
  if (!plant) return { ...UNKNOWN, radiusM: plantRadiusM(undefined), ghost: false }
  const grown = plantedYear !== undefined && view.year !== 'mature'
  const radiusM = grown
    ? plantSizeAt(plant, plantedYear, view.year).spreadM / 2
    : plantRadiusM(plant)
  const ghost = grown && !isPlanted(plantedYear, view.year)
  return cached(cache, plant, `${view.month ?? '-'}|${radiusM}|${ghost}`, () => ({
    ...cached(looks, plant, view.month, () => lookOf(plant, view.month)),
    radiusM,
    ghost,
  }))
}
