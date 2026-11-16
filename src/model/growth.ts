import { DEFAULT_PLANTING_RADIUS_M, findPlant } from './plants'
import type { Plant, PlantCategory, Planting, Project } from './schema'

/**
 * Growth over the years (M13): the size a planting has in a given year. A plant starts at a
 * planting size that depends on its category and grows linearly to its mature size over
 * `yearsToMature` years.
 *
 * - Plants with `yearsToMature` ≤ 1 (annual vegetables and herbs, most bulbs, strawberries, fast
 *   grasses) reach their full size in the season they are planted, so they are mature from the
 *   planting year on.
 * - Before the planting year the planting size is returned; `isPlanted` tells whether a planting
 *   is in the ground yet, so the plan can hide or ghost it.
 * - Fractional years (e.g. 2030.5 from a continuous slider) are interpolated.
 */

export type PlantSize = { spreadM: number; heightM: number }

/** A calendar year (may be fractional) or the mature size. */
export type GrowthView = number | 'mature'

/**
 * Typical size at planting per category: what you buy at a garden centre or nursery. Fruit is
 * soft fruit here; fruit trees use FRUIT_TREE_PLANTING_SIZE.
 */
export const PLANTING_SIZE_BY_CATEGORY: Record<PlantCategory, PlantSize> = {
  tree: { spreadM: 0.5, heightM: 2 }, // a nursery standard
  shrub: { spreadM: 0.3, heightM: 0.4 }, // a 3–5 l pot
  hedge: { spreadM: 0.3, heightM: 0.6 }, // hedging plants, bare root or potted
  perennial: { spreadM: 0.2, heightM: 0.2 }, // a 9 cm to 2 l pot
  grass: { spreadM: 0.2, heightM: 0.2 },
  fern: { spreadM: 0.2, heightM: 0.2 },
  climber: { spreadM: 0.3, heightM: 0.6 }, // on a 60 cm cane
  bulb: { spreadM: 0.1, heightM: 0.2 }, // only used by bulbs that form clumps over the years
  vegetable: { spreadM: 0.2, heightM: 0.2 }, // only perennial ones (rhubarb, asparagus)
  herb: { spreadM: 0.2, heightM: 0.2 }, // only perennial ones (sage, rosemary, …)
  fruit: { spreadM: 0.3, heightM: 0.4 }, // soft fruit: berry bushes, canes
}

/** Fruit plants at least this tall at maturity count as fruit trees (apple, pear, plum, …). */
export const FRUIT_TREE_MIN_HEIGHT_M = 3
export const FRUIT_TREE_PLANTING_SIZE: PlantSize = { spreadM: 0.5, heightM: 1.5 }

/** A young plant is never more than this fraction of its mature size, so every plant grows. */
export const MAX_PLANTING_FRACTION = 0.5

/** Size at planting: the category's planting size, capped at half the mature size. */
export function plantingSize(plant: Plant): PlantSize {
  if (maturesInFirstSeason(plant)) return matureSize(plant)
  const start =
    plant.category === 'fruit' && plant.heightM >= FRUIT_TREE_MIN_HEIGHT_M
      ? FRUIT_TREE_PLANTING_SIZE
      : PLANTING_SIZE_BY_CATEGORY[plant.category]
  return {
    spreadM: Math.min(start.spreadM, plant.spreadM * MAX_PLANTING_FRACTION),
    heightM: Math.min(start.heightM, plant.heightM * MAX_PLANTING_FRACTION),
  }
}

export function matureSize(plant: Plant): PlantSize {
  return { spreadM: plant.spreadM, heightM: plant.heightM }
}

/** Annuals and other plants that reach their full size within a year. */
function maturesInFirstSeason(plant: Pick<Plant, 'yearsToMature'>): boolean {
  return !(plant.yearsToMature > 1) // also catches NaN and other bad data
}

/** True when the planting is in the ground in the viewed year (always for the mature view). */
export function isPlanted(plantedYear: number, view: GrowthView): boolean {
  return view === 'mature' || view >= plantedYear
}

/**
 * How far a plant has grown from its planting size (0) to its mature size (1). Years before the
 * planting year count as the planting year.
 */
export function growthFraction(
  plant: Pick<Plant, 'yearsToMature'>,
  plantedYear: number,
  view: GrowthView,
): number {
  if (view === 'mature' || maturesInFirstSeason(plant)) return 1
  const years = view - plantedYear
  if (!(years > 0)) return 0 // also NaN
  return Math.min(1, years / plant.yearsToMature)
}

/** The size of a plant planted in `plantedYear`, as seen in the viewed year. */
export function plantSizeAt(plant: Plant, plantedYear: number, view: GrowthView): PlantSize {
  const fraction = growthFraction(plant, plantedYear, view)
  if (fraction >= 1) return matureSize(plant)
  const start = plantingSize(plant)
  const lerp = (from: number, to: number) => from + (to - from) * fraction
  return {
    spreadM: lerp(start.spreadM, plant.spreadM),
    heightM: lerp(start.heightM, plant.heightM),
  }
}

/**
 * Drawn radius of a planting in the viewed year: half its spread then. Unknown plants (e.g. a
 * deleted custom plant) get DEFAULT_PLANTING_RADIUS_M, as in `plantingRadiusM`.
 */
export function plantingRadiusAtM(project: Project, planting: Planting, view: GrowthView): number {
  const plant = findPlant(project, planting.plantId)
  return plant
    ? plantSizeAt(plant, planting.plantedYear, view).spreadM / 2
    : DEFAULT_PLANTING_RADIUS_M
}

// --- The growth slider ------------------------------------------------------------------------

/** Slider stops after the planting year (in years); the last stop is the mature size. */
export const GROWTH_STOP_OFFSETS = [0, 1, 3, 5, 10] as const

/** Stable keys of the slider stops. */
export const GROWTH_STOP_IDS = ['planting', '+1', '+3', '+5', '+10', 'mature'] as const
export type GrowthStopId = (typeof GROWTH_STOP_IDS)[number]

export type GrowthStop = {
  /** Stable key: "planting", "+1", "+3", "+5", "+10" or "mature". */
  id: GrowthStopId
  /** Years after the reference year; 0 is the planting year, null the mature size. */
  offsetYears: number | null
  view: GrowthView
}

/** The slider stops "planting year / +1 / +3 / +5 / +10 / mature" for a reference year. */
export function growthStops(referenceYear: number): GrowthStop[] {
  return [
    ...GROWTH_STOP_OFFSETS.map((offset): GrowthStop => ({
      id:
        offset === 0 ? 'planting' : (`+${offset}` as Exclude<GrowthStopId, 'planting' | 'mature'>),
      offsetYears: offset,
      view: referenceYear + offset,
    })),
    { id: 'mature', offsetYears: null, view: 'mature' },
  ]
}

/**
 * The year the slider counts from: the earliest planting year in the design, or `fallbackYear`
 * (typically the current year) when nothing has been planted yet.
 */
export function growthReferenceYear(
  project: Pick<Project, 'plantings'>,
  fallbackYear: number,
): number {
  let earliest = Infinity
  for (const { plantedYear } of project.plantings) earliest = Math.min(earliest, plantedYear)
  return Number.isFinite(earliest) ? earliest : fallbackYear
}
