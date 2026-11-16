import { describe, expect, it } from 'vitest'
import { samplePlant } from '../test/fixtures'
import { newProject } from './defaults'
import {
  isTreeCanopy,
  objectBand,
  objectsInBand,
  plantingBand,
  reorder,
  reorderItems,
} from './drawOrder'
import { addObject } from './objects'
import { OBJECT_PRESETS } from './objectKinds'
import type { Plant, Point, Project } from './schema'

const tri = (x: number): Point[] => [
  { x, y: 0 },
  { x: x + 1, y: 0 },
  { x: x + 1, y: 1 },
]
const poly = (points: Point[]) => ({ type: 'polygon' as const, points })

function design(): { project: Project; ids: string[] } {
  let project = newProject('Order', 0)
  const ids: string[] = []
  for (const [i, kind] of (['shed', 'house', 'pergola', 'terrace'] as const).entries()) {
    const r = addObject(project, kind, poly(tri(i * 3)))
    project = r.project
    ids.push(r.id)
  }
  return { project, ids }
}

const order = (project: Project) => project.objects.map((o) => o.kind)

describe('drawOrder', () => {
  it('puts every kind in its band', () => {
    const { project } = design()
    const bands = project.objects.map(objectBand)
    expect(bands).toEqual(['structure', 'structure', 'structure', 'surface'])
    for (const [kind, preset] of Object.entries(OBJECT_PRESETS)) {
      const { project: p } = addObject(
        newProject('x', 0),
        kind as keyof typeof OBJECT_PRESETS,
        poly(tri(0)),
      )
      expect(objectBand(p.objects[0]!)).toBe(preset.band)
    }
  })

  it('treats trees and tall fruit as canopies', () => {
    const plant = (over: Partial<Plant>): Plant => ({ ...samplePlant, ...over })
    expect(isTreeCanopy(plant({ category: 'tree' }))).toBe(true)
    expect(isTreeCanopy(plant({ category: 'fruit', heightM: 4 }))).toBe(true)
    expect(isTreeCanopy(plant({ category: 'fruit', heightM: 1.5 }))).toBe(false)
    expect(isTreeCanopy(plant({ category: 'shrub' }))).toBe(false)
    expect(isTreeCanopy(undefined)).toBe(false)
    const project = { ...newProject('x', 0), customPlants: [plant({ id: 't', category: 'tree' })] }
    expect(
      plantingBand(project, {
        id: 'p',
        plantId: 't',
        position: { x: 0, y: 0 },
        plantedYear: 2026,
      } as never),
    ).toBe('canopy')
  })

  it('brings forward and sends back within a band only', () => {
    const { project, ids } = design()
    // shed (structure) forward: passes the house, not the terrace in another band.
    const forward = reorderItems(project, new Set([ids[0]!]), 'forward')
    expect(order(forward)).toEqual(['house', 'shed', 'pergola', 'terrace'])
    const back = reorderItems(forward, new Set([ids[0]!]), 'backward')
    expect(order(back)).toEqual(['shed', 'house', 'pergola', 'terrace'])
    // The terrace is alone in its band: nothing moves.
    expect(reorderItems(project, new Set([ids[3]!]), 'forward')).toBe(project)
  })

  it('brings to front and sends to back', () => {
    const { project, ids } = design()
    const front = reorderItems(project, new Set([ids[0]!]), 'front')
    expect(order(front)).toEqual(['house', 'pergola', 'shed', 'terrace'])
    expect(objectsInBand(front, 'structure').map((o) => o.kind)).toEqual([
      'house',
      'pergola',
      'shed',
    ])
    const back = reorderItems(front, new Set([ids[2]!]), 'back')
    expect(order(back)).toEqual(['pergola', 'house', 'shed', 'terrace'])
    expect(reorder([1, 2, 3], (n) => n === 3, 'front')).toEqual([1, 2, 3])
  })

  it('returns the same project when nothing can move', () => {
    const { project, ids } = design()
    expect(reorderItems(project, new Set([ids[2]!]), 'front')).toBe(project)
    expect(reorderItems(project, new Set([ids[0]!]), 'back')).toBe(project)
    expect(reorderItems(project, new Set(['nope']), 'forward')).toBe(project)
  })
})
