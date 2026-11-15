import { findPlant, plantName } from './plants'
import { MONTHS, type Plant, type Project, type VegData } from './schema'

/**
 * The vegetable calendar (M15): per month what to sow indoors, sow outdoors, plant out and
 * harvest, built from the edible plantings in the design (plants with a `veg` calendar:
 * vegetables, herbs and fruit), for the whole design or one bed. Plantings of unknown plants are
 * skipped. Crops are sorted by name in the requested language (then by id), so the order is
 * stable.
 */

export const VEG_ACTIVITIES = ['sowIndoors', 'sowOutdoors', 'plantOut', 'harvest'] as const
export type VegActivity = (typeof VEG_ACTIVITIES)[number]

export type VegCrop = {
  plant: Plant & { veg: VegData }
  /** Display name in the requested language (see `plantName`). */
  name: string
  /** Number of plantings of this crop. */
  count: number
}

export type VegCalendarMonth = { month: number } & Record<VegActivity, VegCrop[]>

export type VegCalendar = {
  /** Every edible crop in scope, sorted by name. */
  crops: VegCrop[]
  /** January to December. */
  months: VegCalendarMonth[]
}

export type VegCalendarOptions = {
  lang: 'en' | 'nl'
  /** Only the plantings in this bed. */
  bedId?: string
}

const hasVeg = (plant: Plant): plant is Plant & { veg: VegData } => plant.veg !== undefined
const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

export function vegCalendar(project: Project, { lang, bedId }: VegCalendarOptions): VegCalendar {
  const counts = new Map<string, { plant: Plant & { veg: VegData }; count: number }>()
  for (const planting of project.plantings) {
    if (bedId !== undefined && planting.bedId !== bedId) continue
    const entry = counts.get(planting.plantId)
    if (entry) {
      entry.count++
      continue
    }
    const plant = findPlant(project, planting.plantId)
    if (plant && hasVeg(plant)) counts.set(planting.plantId, { plant, count: 1 })
  }

  const collator = new Intl.Collator(lang, { sensitivity: 'base', numeric: true })
  const crops: VegCrop[] = [...counts.values()]
    .map(({ plant, count }) => ({ plant, name: plantName(plant, lang), count }))
    .sort((a, b) => collator.compare(a.name, b.name) || compareIds(a.plant.id, b.plant.id))

  const months = MONTHS.map((month): VegCalendarMonth => {
    const doing = (activity: VegActivity) =>
      crops.filter((crop) => crop.plant.veg[activity].includes(month))
    return {
      month,
      sowIndoors: doing('sowIndoors'),
      sowOutdoors: doing('sowOutdoors'),
      plantOut: doing('plantOut'),
      harvest: doing('harvest'),
    }
  })

  return { crops, months }
}

/** True when nothing needs doing in the month. */
export function isQuietMonth(month: VegCalendarMonth): boolean {
  return VEG_ACTIVITIES.every((activity) => month[activity].length === 0)
}
