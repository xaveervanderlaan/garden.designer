import { describe, expect, it } from 'vitest'
import { addBed } from './beds'
import { newProject } from './defaults'
import { MAX_FILL_PLANTS, addPlantings } from './plantings'
import type { Point, Project } from './schema'
import { bedFill, bedRowAngle, setBedRowAngle } from './vegRows'

const LETTUCE = 'lactuca-sativa'
const TOMATO = 'solanum-lycopersicum'
const CARROT = 'daucus-carota-subsp-sativus'

const rect = (w: number, h: number): Point[] => [
  { x: 0, y: 0 },
  { x: w, y: 0 },
  { x: w, y: h },
  { x: 0, y: h },
]

function bedDesign(kind: 'bed-vegetable' | 'bed-ornamental' = 'bed-vegetable') {
  const { project, id } = addBed(newProject('Veg', 0), kind, rect(4, 2))
  return { project, id }
}

const fill = (project: Project, bedId: string, plantId: string, extra = {}) => {
  const plant = TOMATO === plantId ? { s: 0.5, r: 0.8 } : { s: 0.3, r: 0.3 }
  return bedFill(project, { plantId, bedId, spacingM: plant.s, rowSpacingM: plant.r, ...extra })
}

describe('bedFill in rows', () => {
  it('lettuce in 2 rows gives 26 plants along the top', () => {
    const { project, id } = bedDesign()
    const result = bedFill(project, {
      plantId: LETTUCE,
      bedId: id,
      spacingM: 0.3,
      rowSpacingM: 0.3,
      rows: 2,
    })
    expect(result.rowMode).toBe(true)
    expect(result.rowCount).toBe(2)
    expect(result.positions).toHaveLength(26)
    expect(Math.max(...result.positions.map((p) => p.y))).toBeLessThan(0.7)
  })

  it('the next crop starts after the existing rows', () => {
    const { project, id } = bedDesign()
    const lettuce = fill(project, id, LETTUCE, { rows: 2 })
    let p = addPlantings(project, LETTUCE, lettuce.positions, 2027).project
    const tomato = fill(p, id, TOMATO, { rows: 1 })
    expect(tomato.positions).toHaveLength(8)
    for (const pos of tomato.positions) expect(pos.y).toBeCloseTo(1.0)
    p = addPlantings(p, TOMATO, tomato.positions, 2027).project
    const carrot = bedFill(p, { plantId: CARROT, bedId: id, spacingM: 0.04, rowSpacingM: 0.25 })
    expect(carrot.rowCount).toBe(2)
    expect(carrot.positions).toHaveLength(200)
  })

  it('an empty bed with all rows is centred', () => {
    const { project, id } = bedDesign()
    const result = bedFill(project, {
      plantId: CARROT,
      bedId: id,
      spacingM: 0.5,
      rowSpacingM: 0.5,
    })
    const ys = result.positions.map((p) => p.y)
    expect(Math.min(...ys)).toBeCloseTo(0.25)
    expect(Math.max(...ys)).toBeCloseTo(1.75)
  })

  it('uses the staggered fill for an ornamental bed or a plant without veg data', () => {
    const ornamental = bedDesign('bed-ornamental')
    expect(fill(ornamental.project, ornamental.id, LETTUCE).rowMode).toBe(false)
    const veg = bedDesign()
    const result = fill(veg.project, veg.id, 'nepeta-faassenii')
    expect(result.rowMode).toBe(false)
    expect(result.rowCount).toBe(0)
  })

  it("follows the bed's row direction", () => {
    const { project, id } = bedDesign()
    const turned = setBedRowAngle(project, id, 90)
    const result = bedFill(turned, {
      plantId: LETTUCE,
      bedId: id,
      spacingM: 0.3,
      rowSpacingM: 0.3,
      rows: 1,
    })
    expect(new Set(result.positions.map((p) => p.x)).size).toBe(1)
    expect(Math.max(...result.positions.map((p) => p.x))).toBeLessThan(0.4)
  })

  it('reports tooMany above MAX_FILL_PLANTS', () => {
    const { project, id } = bedDesign()
    const result = bedFill(project, {
      plantId: CARROT,
      bedId: id,
      spacingM: 0.01,
      rowSpacingM: 0.01,
    })
    expect(result.tooMany).toBe(true)
    expect(result.positions).toEqual([])
    expect(MAX_FILL_PLANTS).toBe(2000)
  })
})

describe('setBedRowAngle', () => {
  it('normalises and ignores other kinds', () => {
    const { project, id } = bedDesign()
    expect(bedRowAngle(project.objects[0] as never)).toBe(0)
    const set = setBedRowAngle(project, id, 270)
    expect(set.objects[0]!.rowAngleDeg).toBe(90)
    expect(setBedRowAngle(set, id, 90)).toBe(set)
    const ornamental = bedDesign('bed-ornamental')
    expect(setBedRowAngle(ornamental.project, ornamental.id, 45)).toBe(ornamental.project)
  })
})
