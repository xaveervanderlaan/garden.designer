import { formatDecimal, parseNumber } from '../../i18n/units'
import { hasVegCalendar } from '../../model/plants'
import {
  type AutumnColor,
  type FlowerColor,
  type FoliageColor,
  type Plant,
  type PlantCategory,
  type SoilType,
  type SunLevel,
  type Wildlife,
  plantSchema,
} from '../../model/schema'

/** The plant form's state: like a Plant, but with numbers as typed text and a flat veg part. */
export type PlantDraft = {
  nl: string
  en: string
  latin: string
  category: PlantCategory
  height: string
  spread: string
  years: string
  evergreen: boolean
  sun: SunLevel[]
  soil: SoilType[]
  droughtTolerant: boolean
  bloomMonths: number[]
  flowerColors: FlowerColor[]
  foliageColor: FoliageColor
  autumnColor: AutumnColor | null
  nativeNL: boolean
  wildlife: Wildlife[]
  toxic: boolean
  sowIndoors: number[]
  sowOutdoors: number[]
  plantOut: number[]
  harvest: number[]
  rowSpacing: string
  inRowSpacing: string
  family: string
}

export type PlantFormField = 'name' | 'height' | 'spread' | 'years' | 'light' | 'soil' | 'spacing'

const LIMITS = { height: 100, spread: 50, years: 100, spacing: 10 } as const

export function toDraft(plant: Plant): PlantDraft {
  const veg = plant.veg
  return {
    nl: plant.names.nl,
    en: plant.names.en,
    latin: plant.names.latin,
    category: plant.category,
    height: formatDecimal(plant.heightM),
    spread: formatDecimal(plant.spreadM),
    years: formatDecimal(plant.yearsToMature, 1),
    evergreen: plant.evergreen,
    sun: [...plant.sun],
    soil: [...plant.soil],
    droughtTolerant: plant.droughtTolerant,
    bloomMonths: [...plant.bloomMonths],
    flowerColors: [...plant.flowerColors],
    foliageColor: plant.foliageColor,
    autumnColor: plant.autumnColor ?? null,
    nativeNL: plant.nativeNL,
    wildlife: [...plant.wildlife],
    toxic: plant.toxic,
    sowIndoors: [...(veg?.sowIndoors ?? [])],
    sowOutdoors: [...(veg?.sowOutdoors ?? [])],
    plantOut: [...(veg?.plantOut ?? [])],
    harvest: [...(veg?.harvest ?? [])],
    rowSpacing: formatDecimal(veg?.rowSpacingM ?? plant.spreadM),
    inRowSpacing: formatDecimal(veg?.inRowSpacingM ?? plant.spreadM),
    family: veg?.family ?? '',
  }
}

const sortedMonths = (months: readonly number[]) => [...months].sort((a, b) => a - b)

function inRange(text: string, max: number): number | undefined {
  const value = parseNumber(text)
  return value !== undefined && value > 0 && value <= max ? value : undefined
}

/**
 * Turns a draft into a plant (keeping the original's id and `verified` flag), or reports which
 * fields need attention. The calendar part is only kept for vegetables, herbs and fruit.
 */
export function fromDraft(
  draft: PlantDraft,
  original: Plant,
): { plant: Plant; errors: null } | { plant: null; errors: Set<PlantFormField> } {
  const errors = new Set<PlantFormField>()
  const names = { nl: draft.nl.trim(), en: draft.en.trim(), latin: draft.latin.trim() }
  if (!names.nl && !names.en && !names.latin) errors.add('name')
  const heightM = inRange(draft.height, LIMITS.height)
  if (heightM === undefined) errors.add('height')
  const spreadM = inRange(draft.spread, LIMITS.spread)
  if (spreadM === undefined) errors.add('spread')
  const yearsToMature = inRange(draft.years, LIMITS.years)
  if (yearsToMature === undefined) errors.add('years')
  if (draft.sun.length === 0) errors.add('light')
  if (draft.soil.length === 0) errors.add('soil')

  const edible = hasVegCalendar(draft.category)
  const rowSpacingM = inRange(draft.rowSpacing, LIMITS.spacing)
  const inRowSpacingM = inRange(draft.inRowSpacing, LIMITS.spacing)
  if (edible && (rowSpacingM === undefined || inRowSpacingM === undefined)) errors.add('spacing')

  if (errors.size > 0) return { plant: null, errors }

  const family = draft.family.trim()
  const candidate: Plant = {
    id: original.id,
    names,
    category: draft.category,
    heightM: heightM!,
    spreadM: spreadM!,
    yearsToMature: yearsToMature!,
    evergreen: draft.evergreen,
    sun: draft.sun,
    soil: draft.soil,
    droughtTolerant: draft.droughtTolerant,
    bloomMonths: sortedMonths(draft.bloomMonths),
    flowerColors: draft.flowerColors,
    foliageColor: draft.foliageColor,
    ...(draft.autumnColor ? { autumnColor: draft.autumnColor } : {}),
    nativeNL: draft.nativeNL,
    wildlife: draft.wildlife,
    toxic: draft.toxic,
    verified: original.verified,
    ...(edible
      ? {
          veg: {
            sowIndoors: sortedMonths(draft.sowIndoors),
            sowOutdoors: sortedMonths(draft.sowOutdoors),
            plantOut: sortedMonths(draft.plantOut),
            harvest: sortedMonths(draft.harvest),
            rowSpacingM: rowSpacingM!,
            inRowSpacingM: inRowSpacingM!,
            ...(family ? { family } : {}),
          },
        }
      : {}),
  }
  // Belt and braces: everything stored must pass the schema.
  const parsed = plantSchema.safeParse(candidate)
  if (!parsed.success) throw new Error(`Invalid plant from form: ${parsed.error.message}`)
  return { plant: parsed.data, errors: null }
}
