import { describe, expect, it } from 'vitest'
import { BUILT_IN_PLANTS } from '../data/plants'
import { sampleProjectWithAsset, samplePlant } from '../test/fixtures'
import {
  CUSTOM_PLANT_PREFIX,
  allPlants,
  blankCustomPlant,
  customCopyOf,
  deleteCustomPlant,
  findPlant,
  isCustomPlant,
  plantName,
  plantingCount,
  plantingLayer,
  plantingRadiusM,
  saveCustomPlant,
  soilSuitability,
} from './plants'
import { plantSchema } from './schema'

const project = () => sampleProjectWithAsset().project

describe('finding plants', () => {
  it('finds custom plants and built-in plants', () => {
    const p = project()
    expect(findPlant(p, samplePlant.id)).toBe(samplePlant)
    expect(findPlant(p, 'betula-pendula')?.names.nl).toBe('Ruwe berk')
    expect(findPlant(p, 'no-such-plant')).toBeUndefined()
    expect(isCustomPlant(p, samplePlant.id)).toBe(true)
    expect(isCustomPlant(p, 'betula-pendula')).toBe(false)
    expect(allPlants(p)).toHaveLength(BUILT_IN_PLANTS.length + 1)
  })

  it('sizes and layers plantings from their plant', () => {
    const p = project()
    const planting = { ...p.plantings[0]!, plantId: 'betula-pendula' }
    expect(plantingRadiusM(p, planting)).toBe(4)
    expect(plantingLayer(p, planting)).toBe('plants')
    expect(plantingLayer(p, { ...planting, plantId: 'solanum-lycopersicum' })).toBe('vegetables')
    expect(plantingRadiusM(p, { ...planting, plantId: 'gone' })).toBe(0.25)
  })

  it('falls back to the other language, then Latin, for missing names', () => {
    const plant = { ...samplePlant, names: { nl: 'Lavendel', en: '', latin: 'Lavandula' } }
    expect(plantName(plant, 'nl')).toBe('Lavendel')
    expect(plantName(plant, 'en')).toBe('Lavendel')
    expect(plantName({ ...plant, names: { nl: '', en: '', latin: 'Lavandula' } }, 'en')).toBe(
      'Lavandula',
    )
  })
})

describe('soilSuitability', () => {
  it('compares the plant with the design’s soil; sand needs drought tolerance', () => {
    expect(soilSuitability(samplePlant, 'sand')).toBe('suited')
    expect(soilSuitability(samplePlant, 'clay')).toBe('unsuited')
    expect(soilSuitability({ ...samplePlant, droughtTolerant: false }, 'sand')).toBe('dry')
    expect(
      soilSuitability({ ...samplePlant, soil: ['clay'], droughtTolerant: false }, 'clay'),
    ).toBe('suited')
  })
})

describe('custom plants', () => {
  it('starts new plants and copies with their own custom id', () => {
    const blank = blankCustomPlant()
    expect(blank.id.startsWith(CUSTOM_PLANT_PREFIX)).toBe(true)
    // A blank plant has no name yet, so it isn't valid until the form fills one in.
    expect(plantSchema.safeParse(blank).success).toBe(false)
    expect(plantSchema.safeParse({ ...blank, names: { ...blank.names, nl: 'x' } }).success).toBe(
      true,
    )

    const birch = BUILT_IN_PLANTS.find((p) => p.id === 'betula-pendula')!
    const copy = customCopyOf(birch)
    expect(copy.id).not.toBe(birch.id)
    expect(copy.id.startsWith(CUSTOM_PLANT_PREFIX)).toBe(true)
    expect(copy.verified).toBe(true)
    expect(copy.names).toEqual(birch.names)
    copy.sun.push('shade')
    expect(birch.sun).not.toContain('shade')
  })

  it('adds a plant, then replaces it by id', () => {
    const p = project()
    const plant = { ...blankCustomPlant(), names: { nl: 'Mijn plant', en: '', latin: '' } }
    const added = saveCustomPlant(p, plant)
    expect(added.customPlants).toHaveLength(2)
    const renamed = saveCustomPlant(added, { ...plant, names: { ...plant.names, nl: 'Nieuw' } })
    expect(renamed.customPlants).toHaveLength(2)
    expect(findPlant(renamed, plant.id)?.names.nl).toBe('Nieuw')
  })

  it('deletes a custom plant together with its plantings, never a built-in one', () => {
    const p = project()
    expect(plantingCount(p, samplePlant.id)).toBe(1)
    const result = deleteCustomPlant(p, samplePlant.id)
    expect(result.customPlants).toEqual([])
    expect(result.plantings).toEqual([])
    expect(deleteCustomPlant(p, 'betula-pendula')).toBe(p)
  })
})
