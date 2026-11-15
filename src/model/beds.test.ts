import { describe, expect, it } from 'vitest'
import { samplePlant } from '../test/fixtures'
import {
  addBed,
  bedAt,
  bedNumber,
  bedsOf,
  findBed,
  moveBedCorner,
  relinkBeds,
  removeBedCorner,
  setBedEdgeLength,
  setBedKind,
  withPlantsInBeds,
} from './beds'
import { newProject } from './defaults'
import { deleteItems, moveItems } from './edit'
import type { Planting, Point, Project } from './schema'

const rect = (x: number, y: number, w: number, h: number): Point[] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
]

const planting = (id: string, x: number, y: number): Planting => ({
  id,
  plantId: samplePlant.id,
  position: { x, y },
  plantedYear: 2027,
})

/** Two plants: a at (1, 1) and b at (5, 1); no beds yet. */
function design(): Project {
  return {
    ...newProject('Beds', 0),
    customPlants: [samplePlant],
    plantings: [planting('a', 1, 1), planting('b', 5, 1)],
  }
}

const bedIdOf = (project: Project, id: string) => project.plantings.find((p) => p.id === id)?.bedId

describe('beds', () => {
  it('adds a bed on its layer and links the plants already inside it', () => {
    const { project, id } = addBed(design(), 'bed-ornamental', rect(0, 0, 2, 2))
    const bed = findBed(project, id)!
    expect(bed.layer).toBe('plants')
    expect(bedIdOf(project, 'a')).toBe(id)
    expect(bedIdOf(project, 'b')).toBeUndefined()

    const veg = addBed(project, 'bed-vegetable', rect(4, 0, 2, 2))
    expect(findBed(veg.project, veg.id)!.layer).toBe('vegetables')
    expect(bedIdOf(veg.project, 'b')).toBe(veg.id)
  })

  it('finds the topmost bed under a point', () => {
    const first = addBed(design(), 'bed-ornamental', rect(0, 0, 4, 4))
    const second = addBed(first.project, 'bed-vegetable', rect(1, 1, 1, 1))
    expect(bedAt(second.project, { x: 1.5, y: 1.5 })?.id).toBe(second.id)
    expect(bedAt(second.project, { x: 3, y: 3 })?.id).toBe(first.id)
    expect(bedAt(second.project, { x: 9, y: 9 })).toBeUndefined()
  })

  it('relinks only when something changes', () => {
    const { project } = addBed(design(), 'bed-ornamental', rect(0, 0, 2, 2))
    expect(relinkBeds(project)).toBe(project)
    // A stale link (e.g. from a hand-made file) is corrected.
    const stale = { ...project, plantings: project.plantings.map((p) => ({ ...p, bedId: 'x' })) }
    const fixed = relinkBeds(stale)
    expect(bedIdOf(fixed, 'a')).toBe(project.objects[0]!.id)
    expect('bedId' in fixed.plantings[1]!).toBe(false)
  })

  it('keeps links up to date when plants move', () => {
    const { project, id } = addBed(design(), 'bed-ornamental', rect(0, 0, 2, 2))
    const out = moveItems(project, new Set(['a']), 5, 0)
    expect(bedIdOf(out, 'a')).toBeUndefined()
    const back = moveItems(out, new Set(['b']), -4.5, 0)
    expect(bedIdOf(back, 'b')).toBe(id)
  })

  it('moves the plants in a bed along with the bed', () => {
    const { project, id } = addBed(design(), 'bed-ornamental', rect(0, 0, 2, 2))
    expect([...withPlantsInBeds(project, new Set([id]))].sort()).toEqual(['a', id].sort())
    const moved = moveItems(project, new Set([id]), 10, 0)
    expect(moved.plantings.find((p) => p.id === 'a')!.position).toEqual({ x: 11, y: 1 })
    expect(bedIdOf(moved, 'a')).toBe(id)
    expect(moved.plantings.find((p) => p.id === 'b')!.position).toEqual({ x: 5, y: 1 })
  })

  it('keeps links up to date when corners change', () => {
    const { project, id } = addBed(design(), 'bed-ornamental', rect(0, 0, 2, 2))
    // Stretch the bed to take in b at (5, 1).
    const wide = setBedEdgeLength(project, id, 0, 6)
    const wider = moveBedCorner(wide, id, 2, { x: 6, y: 2 })
    expect(bedIdOf(wider, 'b')).toBe(id)
    // Drop the corner at (6, 0): the triangle that's left no longer contains b.
    const triangle = removeBedCorner(wider, id, 1)
    expect(findBed(triangle, id)!.shape.points).toHaveLength(3)
    expect(bedIdOf(triangle, 'b')).toBeUndefined()
    expect(removeBedCorner(triangle, id, 0)).toBe(triangle) // 3 corners is the minimum
  })

  it('unlinks the plants of a deleted bed (they stay on the plan)', () => {
    const { project, id } = addBed(design(), 'bed-ornamental', rect(0, 0, 2, 2))
    const deleted = deleteItems(project, new Set([id]))
    expect(deleted.plantings).toHaveLength(2)
    expect(bedIdOf(deleted, 'a')).toBeUndefined()
  })

  it('switches kind (and layer), and numbers beds per kind', () => {
    const a = addBed(design(), 'bed-ornamental', rect(0, 0, 1, 1))
    const b = addBed(a.project, 'bed-vegetable', rect(2, 0, 1, 1))
    const c = addBed(b.project, 'bed-ornamental', rect(4, 0, 1, 1))
    const beds = bedsOf(c.project)
    expect(beds.map((bed) => bedNumber(c.project, bed))).toEqual([1, 1, 2])
    const switched = setBedKind(c.project, a.id, 'bed-vegetable')
    expect(findBed(switched, a.id)).toMatchObject({ kind: 'bed-vegetable', layer: 'vegetables' })
    expect(setBedKind(switched, a.id, 'bed-vegetable')).toBe(switched)
  })
})
