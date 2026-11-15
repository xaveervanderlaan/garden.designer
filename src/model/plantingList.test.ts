import { describe, expect, it } from 'vitest'
import { samplePlant } from '../test/fixtures'
import { addBed } from './beds'
import { newProject } from './defaults'
import { plantingList, plantingListByBed } from './plantingList'
import { addPlantings } from './plantings'
import type { Point } from './schema'

const rect = (x: number, y: number, w: number, h: number): Point[] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
]

function design() {
  const base = { ...newProject('List', 0), customPlants: [samplePlant] }
  const front = addBed(base, 'bed-ornamental', rect(0, 0, 4, 2))
  const back = addBed(front.project, 'bed-ornamental', rect(10, 0, 4, 2))
  let project = back.project
  project = addPlantings(project, 'nepeta-faassenii', rect(0.5, 0.5, 1, 1), 2027).project // 4 in front
  project = addPlantings(project, samplePlant.id, [{ x: 3, y: 1 }], 2027).project // 1 in front
  project = addPlantings(project, samplePlant.id, rect(11, 0.5, 1, 1), 2027).project // 4 in back
  project = addPlantings(project, 'gone', [{ x: 20, y: 20 }], 2027).project // not in a bed
  return { project, front: front.id, back: back.id }
}

describe('planting list', () => {
  it('counts every species, in species-code order', () => {
    const { project } = design()
    expect(
      plantingList(project).map((row) => [row.code, row.plantId, row.count, !!row.plant]),
    ).toEqual([
      [1, 'nepeta-faassenii', 4, true],
      [2, samplePlant.id, 5, true],
      [3, 'gone', 1, false],
    ])
  })

  it('counts per bed, then the plants outside beds', () => {
    const { project, front, back } = design()
    const groups = plantingListByBed(project)
    expect(groups.map((g) => [g.bedId, g.total])).toEqual([
      [front, 5],
      [back, 4],
      [null, 1],
    ])
    expect(groups[0]!.rows.map((r) => [r.code, r.count])).toEqual([
      [1, 4],
      [2, 1],
    ])
    expect(groups[1]!.rows.map((r) => [r.code, r.count])).toEqual([[2, 4]])
  })

  it('leaves out beds without plants, and is empty for an empty design', () => {
    const { project } = design()
    const extra = addBed(project, 'bed-vegetable', rect(30, 30, 1, 1)).project
    expect(plantingListByBed(extra)).toHaveLength(3)
    const empty = newProject('Empty', 0)
    expect(plantingList(empty)).toEqual([])
    expect(plantingListByBed(empty)).toEqual([])
  })
})
