import { findPlant, plantName } from './plants'
import { FLOWER_COLORS, type FlowerColor, MONTHS, type Plant, type Project } from './schema'
import { bloomColor, isInBloom } from './season'

/**
 * The bloom chart (M14): which species in the design flower in which month, with their colours
 * and how many of them there are, for the whole design or one bed. Plantings of unknown plants
 * are skipped.
 */

export type BloomSpecies = {
  plant: Plant
  /** Display name in the requested language (see `plantName`). */
  name: string
  /** All flower colours; the first one is the one drawn on the plan. */
  colors: readonly FlowerColor[]
  /** Number of plantings of this species. */
  count: number
}

export type BloomChartMonth = {
  month: number
  /** Species in bloom, in the same order as `BloomChart.species`. */
  species: BloomSpecies[]
  /** Plantings in bloom per drawn colour, most first: for a colour band per month. */
  colors: { color: FlowerColor; count: number }[]
  /** Number of plantings in bloom. */
  count: number
}

export type BloomChart = {
  /** Every flowering species in scope, ordered by the start of its bloom, then by name. */
  species: BloomSpecies[]
  /** January to December. */
  months: BloomChartMonth[]
  /** Months with nothing in bloom (all of them when nothing flowering has been planted). */
  emptyMonths: number[]
}

export type BloomChartOptions = {
  lang: 'en' | 'nl'
  /** Only the plantings in this bed. */
  bedId?: string
}

const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

export function bloomChart(project: Project, { lang, bedId }: BloomChartOptions): BloomChart {
  const counts = new Map<string, { plant: Plant; count: number }>()
  for (const planting of project.plantings) {
    if (bedId !== undefined && planting.bedId !== bedId) continue
    const entry = counts.get(planting.plantId)
    if (entry) {
      entry.count++
      continue
    }
    const plant = findPlant(project, planting.plantId)
    if (plant && plant.bloomMonths.length > 0 && plant.flowerColors.length > 0) {
      counts.set(planting.plantId, { plant, count: 1 })
    }
  }

  const collator = new Intl.Collator(lang, { sensitivity: 'base', numeric: true })
  const first = (plant: Plant) => Math.min(...plant.bloomMonths)
  const last = (plant: Plant) => Math.max(...plant.bloomMonths)
  const species: BloomSpecies[] = [...counts.values()]
    .map(({ plant, count }) => ({
      plant,
      name: plantName(plant, lang),
      colors: plant.flowerColors,
      count,
    }))
    .sort(
      (a, b) =>
        first(a.plant) - first(b.plant) ||
        last(a.plant) - last(b.plant) ||
        collator.compare(a.name, b.name) ||
        compareIds(a.plant.id, b.plant.id),
    )

  const months = MONTHS.map((month): BloomChartMonth => {
    const inBloom = species.filter((s) => isInBloom(s.plant, month))
    const byColor = new Map<FlowerColor, number>()
    for (const s of inBloom) {
      const color = bloomColor(s.plant)!
      byColor.set(color, (byColor.get(color) ?? 0) + s.count)
    }
    const colors = [...byColor]
      .map(([color, count]) => ({ color, count }))
      .sort(
        (a, b) =>
          b.count - a.count || FLOWER_COLORS.indexOf(a.color) - FLOWER_COLORS.indexOf(b.color),
      )
    return {
      month,
      species: inBloom,
      colors,
      count: inBloom.reduce((sum, s) => sum + s.count, 0),
    }
  })

  return {
    species,
    months,
    emptyMonths: months.filter((m) => m.species.length === 0).map((m) => m.month),
  }
}
