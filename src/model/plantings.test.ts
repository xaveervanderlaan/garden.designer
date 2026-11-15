import { describe, expect, it } from 'vitest'
import { builtInPlant } from '../data/plants'
import { samplePlant } from '../test/fixtures'
import { addBed } from './beds'
import { newProject } from './defaults'
import {
  MAX_FILL_PLANTS,
  addPlantings,
  defaultRowSpacingM,
  fillBedPositions,
  plantingLabels,
  speciesCodes,
  swapSpecies,
} from './plantings'
import type { Point, Project } from './schema'

const rect = (x: number, y: number, w: number, h: number): Point[] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
]

function design(): Project {
  return { ...newProject('Plants', 0), customPlants: [samplePlant] }
}

describe('plantings', () => {
  it('adds plantings in one change, linked to their bed', () => {
    const bed = addBed(design(), 'bed-ornamental', rect(0, 0, 2, 2))
    const { project, ids } = addPlantings(
      bed.project,
      samplePlant.id,
      [
        { x: 1, y: 1 },
        { x: 5, y: 5 },
      ],
      2027,
    )
    expect(ids).toHaveLength(2)
    expect(project.plantings.map((p) => p.bedId)).toEqual([bed.id, undefined])
    expect(project.plantings[0]).toMatchObject({ plantId: samplePlant.id, plantedYear: 2027 })
    expect(addPlantings(project, samplePlant.id, [], 2027).project).toBe(project)
  })

  it('swaps the species of some plantings only', () => {
    const { project, ids } = addPlantings(design(), samplePlant.id, rect(0, 0, 1, 1), 2027)
    const swapped = swapSpecies(project, new Set(ids.slice(0, 2)), 'nepeta-faassenii')
    expect(swapped.plantings.map((p) => p.plantId)).toEqual([
      'nepeta-faassenii',
      'nepeta-faassenii',
      samplePlant.id,
      samplePlant.id,
    ])
    expect(swapSpecies(swapped, new Set(ids.slice(0, 2)), 'nepeta-faassenii')).toBe(swapped)
  })

  it('numbers species in order of first appearance, for codes and labels', () => {
    let project = addPlantings(design(), 'nepeta-faassenii', [{ x: 0, y: 0 }], 2027).project
    project = addPlantings(project, samplePlant.id, [{ x: 1, y: 0 }], 2027).project
    project = addPlantings(project, 'nepeta-faassenii', [{ x: 2, y: 0 }], 2027).project
    expect([...speciesCodes(project)]).toEqual([
      ['nepeta-faassenii', 1],
      [samplePlant.id, 2],
    ])
    expect([...plantingLabels(project, 'code', 'en').values()]).toEqual(['1', '2', '1'])
    expect([...plantingLabels(project, 'name', 'nl').values()]).toEqual([
      'Kattenkruid',
      'Lavendel',
      'Kattenkruid',
    ])
  })

  it('fills a bed, skipping spots taken by plants already there', () => {
    const bed = addBed(design(), 'bed-ornamental', rect(0, 0, 3, 1.2))
    const empty = fillBedPositions(bed.project, bed.id, samplePlant.id, 0.6)
    expect(empty.tooMany).toBe(false)
    expect(empty.positions.length).toBeGreaterThan(4)

    const withShrub = addPlantings(bed.project, samplePlant.id, [{ x: 1.5, y: 0.6 }], 2027)
    const around = fillBedPositions(withShrub.project, bed.id, samplePlant.id, 0.6)
    expect(around.positions.length).toBeLessThan(empty.positions.length)
    for (const p of around.positions) {
      expect(Math.hypot(p.x - 1.5, p.y - 0.6)).toBeGreaterThan(0.6 * 0.8 - 1e-9)
    }
  })

  it('refuses a fill that would need too many plants', () => {
    const bed = addBed(design(), 'bed-ornamental', rect(0, 0, 50, 50))
    const result = fillBedPositions(bed.project, bed.id, samplePlant.id, 0.1)
    expect(result).toEqual({ positions: [], tooMany: true })
    expect(MAX_FILL_PLANTS).toBeGreaterThan(100)
    expect(fillBedPositions(bed.project, 'nope', samplePlant.id, 1).positions).toEqual([])
  })

  it('suggests row spacings: 3 per metre for a hedge, the in-row spacing for crops', () => {
    expect(defaultRowSpacingM(builtInPlant('carpinus-betulus')!)).toBe(0.33)
    const lettuce = builtInPlant('lactuca-sativa')!
    expect(defaultRowSpacingM(lettuce)).toBe(lettuce.veg!.inRowSpacingM)
    expect(defaultRowSpacingM(samplePlant)).toBe(samplePlant.spreadM)
  })
})
