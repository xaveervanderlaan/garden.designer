import type { FlowerColor, Plant, PlantColor } from './schema'

/**
 * The seasonal view (M14): how a plant looks in a given month (1 = January … 12 = December).
 *
 * - **flowering**: the month is one of its bloom months → its first flower colour. This wins over
 *   everything else (witch hazel on bare twigs, snowdrops, hellebores).
 * - **autumn**: October–November, for plants with an autumn colour (evergreens too: bergenia and
 *   nandina colour up but keep their leaves).
 * - **leaf**: in leaf → its foliage colour. Evergreens are always in leaf.
 * - **bare**: deciduous woody plants (trees, shrubs, hedges, climbers, fruit) in December–March:
 *   the branches are still there, so the plan draws the symbol outlined, without a fill.
 * - **dormant**: nothing (much) above ground: herbaceous perennials, ferns and deciduous grasses
 *   in winter, bulbs outside their leaf period and annual vegetables and herbs while they are not
 *   in the ground. The plan can draw these faint (e.g. a dashed outline) or hide them.
 *
 * Which rule applies follows from the plant's `SeasonalHabit`.
 */

export type SeasonState = 'flowering' | 'leaf' | 'autumn' | 'bare' | 'dormant'

export type SeasonAppearance = {
  state: SeasonState
  /** Fill colour; null when bare or dormant (draw an outline only, or nothing). */
  color: PlantColor | null
}

/** Months in which deciduous plants are bare (or dormant). */
export const WINTER_MONTHS: readonly number[] = [12, 1, 2, 3]
/** Months in which plants with an autumn colour show it. */
export const AUTUMN_MONTHS: readonly number[] = [10, 11]
/**
 * Deciduous grasses with an autumn colour stand through the winter as dried leaves and plumes
 * until they are cut back in March.
 */
export const GRASS_STANDING_MONTHS: readonly number[] = [10, 11, 12, 1, 2]
/** A bulb is in leaf from this many months before its first bloom month… */
export const BULB_LEAF_MONTHS_BEFORE = 1
/** …until this many months after its last one. */
export const BULB_LEAF_MONTHS_AFTER = 1

/**
 * How a plant goes through the year:
 * - `evergreen`: always in leaf;
 * - `woody`: trees, shrubs, hedges, perennial climbers and fruit; bare in winter;
 * - `herbaceous`: perennials, ferns, annual climbers, perennial vegetables and herbs; die back in
 *   winter;
 * - `grass`: deciduous grasses; like herbaceous, but stand through the winter in their autumn
 *   colour (if they have one);
 * - `bulb`: in leaf around their bloom months, dormant the rest of the year;
 * - `annual`: vegetables and herbs with `yearsToMature` ≤ 1 and a calendar: in the ground from
 *   sowing outdoors or planting out until the end of the harvest that follows.
 */
export type SeasonalHabit = 'evergreen' | 'woody' | 'herbaceous' | 'grass' | 'bulb' | 'annual'

export function seasonalHabit(plant: Plant): SeasonalHabit {
  if (plant.evergreen) return 'evergreen'
  switch (plant.category) {
    case 'tree':
    case 'shrub':
    case 'hedge':
    case 'fruit':
      return 'woody'
    case 'climber':
      // Sweet peas and other annual climbers die off; the rest keep their stems.
      return plant.yearsToMature > 1 ? 'woody' : 'herbaceous'
    case 'perennial':
    case 'fern':
      return 'herbaceous'
    case 'grass':
      return 'grass'
    case 'bulb':
      return plant.bloomMonths.length > 0 ? 'bulb' : 'herbaceous'
    case 'vegetable':
    case 'herb':
      return !(plant.yearsToMature > 1) && inGroundMonths(plant).size > 0 ? 'annual' : 'herbaceous'
  }
}

/** True when the plant flowers in the month and has a flower colour to show. */
export function isInBloom(plant: Plant, month: number): boolean {
  return plant.bloomMonths.includes(month) && plant.flowerColors.length > 0
}

/** The colour drawn for a plant in bloom: its first (most typical) flower colour. */
export function bloomColor(plant: Plant): FlowerColor | null {
  return plant.flowerColors[0] ?? null
}

/** How the plant looks in a month (1–12). */
export function plantAppearance(plant: Plant, month: number): SeasonAppearance {
  if (isInBloom(plant, month)) return { state: 'flowering', color: bloomColor(plant) }

  const leaf: SeasonAppearance = { state: 'leaf', color: plant.foliageColor }
  const autumn: SeasonAppearance | null = plant.autumnColor
    ? { state: 'autumn', color: plant.autumnColor }
    : null
  const isAutumn = AUTUMN_MONTHS.includes(month)
  const isWinter = WINTER_MONTHS.includes(month)
  const dormant: SeasonAppearance = { state: 'dormant', color: null }

  switch (seasonalHabit(plant)) {
    case 'evergreen':
      return (isAutumn && autumn) || leaf
    case 'woody':
      if (isWinter) return { state: 'bare', color: null }
      return (isAutumn && autumn) || leaf
    case 'herbaceous':
      if (isWinter) return dormant
      return (isAutumn && autumn) || leaf
    case 'grass':
      if (autumn && GRASS_STANDING_MONTHS.includes(month)) return autumn
      return isWinter ? dormant : leaf
    case 'bulb':
      return bulbLeafMonths(plant).has(month) ? leaf : dormant
    case 'annual':
      return inGroundMonths(plant).has(month) ? leaf : dormant
  }
}

/** The appearance for every month, January first. */
export function plantYear(plant: Plant): SeasonAppearance[] {
  return Array.from({ length: 12 }, (_, i) => plantAppearance(plant, i + 1))
}

const nextMonth = (month: number, steps = 1) => ((((month - 1 + steps) % 12) + 12) % 12) + 1

/** Bloom months widened by the leaf period around them. */
function bulbLeafMonths(plant: Plant): Set<number> {
  const months = new Set<number>()
  for (const month of plant.bloomMonths) {
    for (let step = -BULB_LEAF_MONTHS_BEFORE; step <= BULB_LEAF_MONTHS_AFTER; step++) {
      months.add(nextMonth(month, step))
    }
  }
  return months
}

/**
 * Months an annual crop is in the ground: from each month it is sown outdoors or planted out,
 * until the end of the first harvest period after that month. Empty when the calendar has no
 * outdoor start or no harvest.
 */
export function inGroundMonths(plant: Plant): Set<number> {
  const months = new Set<number>()
  const veg = plant.veg
  if (!veg || veg.harvest.length === 0) return months
  const harvest = new Set(veg.harvest)
  const endsHarvest = (month: number) => harvest.has(month) && !harvest.has(nextMonth(month))
  for (const start of new Set([...veg.sowOutdoors, ...veg.plantOut])) {
    months.add(start)
    // A crop isn't harvested in the month it goes in, so a harvest ending then doesn't count.
    for (let step = 1, month = nextMonth(start); step < 12; step++, month = nextMonth(month)) {
      months.add(month)
      if (endsHarvest(month)) break
    }
  }
  return months
}
