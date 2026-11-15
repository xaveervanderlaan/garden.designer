import { describe, expect, it } from 'vitest'
import { builtInPlant } from '../data/plants'
import { sampleProjectWithAsset, samplePlant } from '../test/fixtures'
import {
  growthFraction,
  growthReferenceYear,
  growthStops,
  isPlanted,
  plantSizeAt,
  plantingRadiusAtM,
  plantingSize,
} from './growth'
import { DEFAULT_PLANTING_RADIUS_M } from './plants'
import type { Plant } from './schema'

const plant = (id: string): Plant => {
  const found = builtInPlant(id)
  if (!found) throw new Error(`No built-in plant ${id}`)
  return found
}

/** Field maple: 8 m spread, 10 m tall after 25 years. */
const maple = plant('acer-campestre')

describe('plantSizeAt', () => {
  it('starts a tree at its planting size', () => {
    expect(plantSizeAt(maple, 2027, 2027)).toEqual({ spreadM: 0.5, heightM: 2 })
  })

  it('grows linearly to the mature size over yearsToMature', () => {
    const halfway = plantSizeAt(maple, 2027, 2027 + 12.5)
    expect(halfway.spreadM).toBeCloseTo((0.5 + 8) / 2)
    expect(halfway.heightM).toBeCloseTo((2 + 10) / 2)
    const after10 = plantSizeAt(maple, 2027, 2037)
    expect(after10.spreadM).toBeCloseTo(0.5 + 7.5 * (10 / 25))
  })

  it('is mature after yearsToMature, and stays mature', () => {
    expect(plantSizeAt(maple, 2027, 2052)).toEqual({ spreadM: 8, heightM: 10 })
    expect(plantSizeAt(maple, 2027, 2100)).toEqual({ spreadM: 8, heightM: 10 })
    expect(plantSizeAt(maple, 2027, 'mature')).toEqual({ spreadM: 8, heightM: 10 })
  })

  it('interpolates fractional years', () => {
    const lavender = samplePlant // 0.6 × 0.6 m after 3 years; starts at 0.3 × 0.3 (half)
    expect(plantSizeAt(lavender, 2027, 2028.5).spreadM).toBeCloseTo(0.3 + 0.3 * 0.5)
  })

  it('returns the planting size before the planting year (isPlanted tells it apart)', () => {
    expect(plantSizeAt(maple, 2027, 2020)).toEqual(plantingSize(maple))
    expect(isPlanted(2027, 2020)).toBe(false)
    expect(isPlanted(2027, 2026.5)).toBe(false)
    expect(isPlanted(2027, 2027)).toBe(true)
    expect(isPlanted(2027, 'mature')).toBe(true)
  })

  it('draws annual vegetables, herbs and bulbs at their mature size from the planting year', () => {
    for (const id of ['solanum-lycopersicum', 'ocimum-basilicum', 'tulipa-darwin-hybrid-group']) {
      const annual = plant(id)
      expect(plantSizeAt(annual, 2027, 2027), id).toEqual({
        spreadM: annual.spreadM,
        heightM: annual.heightM,
      })
    }
  })

  it('treats yearsToMature below 1 (or bad data) as mature in the first season', () => {
    const fast = { ...samplePlant, yearsToMature: 0.5 }
    expect(plantSizeAt(fast, 2027, 2027)).toEqual({ spreadM: 0.6, heightM: 0.6 })
    expect(growthFraction({ yearsToMature: Number.NaN }, 2027, 2027)).toBe(1)
  })

  it('grows perennial vegetables and herbs from a young plant', () => {
    const asparagus = plant('asparagus-officinalis') // 3 years
    expect(plantSizeAt(asparagus, 2027, 2027).spreadM).toBeLessThan(asparagus.spreadM)
    expect(plantSizeAt(asparagus, 2027, 2030).spreadM).toBe(asparagus.spreadM)
  })
})

describe('plantingSize', () => {
  it('uses the category, with fruit trees apart from soft fruit', () => {
    expect(plantingSize(plant('malus-domestica'))).toEqual({ spreadM: 0.5, heightM: 1.5 })
    expect(plantingSize(plant('ribes-nigrum'))).toEqual({ spreadM: 0.3, heightM: 0.4 })
    expect(plantingSize(plant('carpinus-betulus'))).toEqual({ spreadM: 0.25, heightM: 0.6 })
  })

  it('is never more than half the mature size', () => {
    const box = plant('buxus-sempervirens') // a hedge of 0.4 × 0.6 m
    expect(plantingSize(box)).toEqual({ spreadM: 0.2, heightM: 0.3 })
    const tiny = { ...maple, spreadM: 0.6, heightM: 1 }
    expect(plantingSize(tiny)).toEqual({ spreadM: 0.3, heightM: 0.5 })
  })
})

describe('plantingRadiusAtM', () => {
  it('is half the spread in the viewed year, with a default for unknown plants', () => {
    const { project } = sampleProjectWithAsset()
    const planting = project.plantings[0]! // lavender, planted 2027
    expect(plantingRadiusAtM(project, planting, 2027)).toBeCloseTo(0.15)
    expect(plantingRadiusAtM(project, planting, 'mature')).toBeCloseTo(0.3)
    const unknown = { ...planting, plantId: 'custom-gone' }
    expect(plantingRadiusAtM(project, unknown, 2030)).toBe(DEFAULT_PLANTING_RADIUS_M)
  })
})

describe('growth slider', () => {
  it('offers planting year, +1, +3, +5, +10 and mature', () => {
    expect(growthStops(2027)).toEqual([
      { id: 'planting', offsetYears: 0, view: 2027 },
      { id: '+1', offsetYears: 1, view: 2028 },
      { id: '+3', offsetYears: 3, view: 2030 },
      { id: '+5', offsetYears: 5, view: 2032 },
      { id: '+10', offsetYears: 10, view: 2037 },
      { id: 'mature', offsetYears: null, view: 'mature' },
    ])
  })

  it('counts from the earliest planting, or the fallback year', () => {
    const { project } = sampleProjectWithAsset()
    const first = project.plantings[0]!
    project.plantings.push({ ...first, id: 'p-2', plantedYear: 2025 })
    expect(growthReferenceYear(project, 2030)).toBe(2025)
    expect(growthReferenceYear({ plantings: [] }, 2030)).toBe(2030)
  })
})
