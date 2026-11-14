import { describe, expect, it } from 'vitest'
import { hasVegCalendar } from '../../model/plants'
import { type Plant, type PlantCategory, plantSchema } from '../../model/schema'
import { BUILT_IN_PLANTS, PLANT_FILES, builtInPlant } from '.'

/** Which categories each data file may contain. */
const FILE_CATEGORIES: Record<string, PlantCategory[]> = {
  trees: ['tree'],
  shrubs: ['shrub'],
  hedging: ['hedge'],
  perennials: ['perennial'],
  'grasses-ferns': ['grass', 'fern'],
  climbers: ['climber'],
  bulbs: ['bulb'],
  vegetables: ['vegetable'],
  herbs: ['herb'],
  fruit: ['fruit'],
}

/** Same rule as the generator: the Latin name in lower case, accents and punctuation → "-". */
const slug = (latin: string) =>
  latin
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const isSorted = (months: readonly number[]) =>
  months.every((m, i) => i === 0 || months[i - 1]! < m)

const label = (plant: Plant) => `${plant.id} (${plant.names.latin})`

describe('built-in plant data', () => {
  it('has a file for every batch and nothing else', () => {
    expect(Object.keys(PLANT_FILES).sort()).toEqual(Object.keys(FILE_CATEGORIES).sort())
  })

  it('has about 200 ornamentals and 50 vegetables, herbs and fruit', () => {
    const edible = BUILT_IN_PLANTS.filter((p) => hasVegCalendar(p.category)).length
    expect(BUILT_IN_PLANTS.length - edible).toBeGreaterThanOrEqual(200)
    expect(edible).toBeGreaterThanOrEqual(50)
  })

  it.each(Object.entries(PLANT_FILES))(
    '%s: every plant matches the schema exactly',
    (_, plants) => {
      for (const plant of plants) {
        const result = plantSchema.safeParse(plant)
        expect(result.success, `${label(plant)}: ${result.error?.message}`).toBe(true)
        // Unknown (e.g. misspelt) fields would be dropped by the parse.
        expect(result.data, label(plant)).toEqual(plant)
      }
    },
  )

  it.each(Object.entries(PLANT_FILES))('%s: only the expected categories', (file, plants) => {
    for (const plant of plants) {
      expect(FILE_CATEGORIES[file], label(plant)).toContain(plant.category)
    }
  })

  it('has unique ids and names (a species may appear once more as a hedge)', () => {
    const keys = {
      id: (p: Plant) => p.id,
      nl: (p: Plant) => p.names.nl.toLowerCase(),
      en: (p: Plant) => p.names.en.toLowerCase(),
      latin: (p: Plant) => `${p.names.latin.toLowerCase()} (${p.category})`,
    }
    for (const [key, value] of Object.entries(keys)) {
      const values = BUILT_IN_PLANTS.map(value)
      const duplicates = values.filter((v, i) => values.indexOf(v) !== i)
      expect(duplicates, key).toEqual([])
    }
  })

  it('gives every plant three names and an id made from the Latin name', () => {
    for (const plant of BUILT_IN_PLANTS) {
      expect(plant.names.nl && plant.names.en && plant.names.latin, label(plant)).toBeTruthy()
      const base = slug(plant.names.latin)
      expect(plant.id === base || plant.id.startsWith(`${base}-`), label(plant)).toBe(true)
      expect(plant.id.startsWith('custom-'), label(plant)).toBe(false)
      expect(builtInPlant(plant.id)).toBe(plant)
    }
  })

  it('keeps sizes and growth times in a sane range', () => {
    for (const plant of BUILT_IN_PLANTS) {
      expect(plant.heightM, label(plant)).toBeGreaterThanOrEqual(0.05)
      expect(plant.heightM, label(plant)).toBeLessThanOrEqual(30)
      expect(plant.spreadM, label(plant)).toBeGreaterThanOrEqual(0.03)
      expect(plant.spreadM, label(plant)).toBeLessThanOrEqual(30)
      expect(plant.yearsToMature, label(plant)).toBeGreaterThanOrEqual(1)
      expect(plant.yearsToMature, label(plant)).toBeLessThanOrEqual(60)
    }
  })

  it('lists months in calendar order', () => {
    for (const plant of BUILT_IN_PLANTS) {
      const lists = [plant.bloomMonths, ...Object.values(plant.veg ?? {}).filter(Array.isArray)]
      for (const months of lists) expect(isSorted(months as number[]), label(plant)).toBe(true)
    }
  })

  it('has flower colours exactly when it has flowering months', () => {
    for (const plant of BUILT_IN_PLANTS) {
      expect(plant.flowerColors.length > 0, label(plant)).toBe(plant.bloomMonths.length > 0)
    }
  })

  it('only marks plants as good for bees or butterflies when they flower', () => {
    for (const plant of BUILT_IN_PLANTS) {
      const pollinators = plant.wildlife.some((w) => w === 'bees' || w === 'butterflies')
      if (pollinators) expect(plant.bloomMonths.length, label(plant)).toBeGreaterThan(0)
    }
  })

  it('has a calendar for every vegetable, herb and fruit, and only for those', () => {
    for (const plant of BUILT_IN_PLANTS) {
      expect(plant.veg !== undefined, label(plant)).toBe(hasVegCalendar(plant.category))
      if (!plant.veg) continue
      expect(plant.veg.harvest.length, label(plant)).toBeGreaterThan(0)
      const starts = [...plant.veg.sowIndoors, ...plant.veg.sowOutdoors, ...plant.veg.plantOut]
      expect(starts.length, label(plant)).toBeGreaterThan(0)
      expect(plant.veg.inRowSpacingM, label(plant)).toBeLessThanOrEqual(plant.veg.rowSpacingM)
      expect(plant.veg.family, label(plant)).toMatch(/^[A-Z][a-z]+aceae$/)
    }
  })
})
