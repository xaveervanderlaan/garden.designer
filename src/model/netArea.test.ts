import { describe, expect, it } from 'vitest'
import { reorderItems } from './drawOrder'
import { newProject } from './defaults'
import { addObject } from './objects'
import { surfaceAreas } from './netArea'
import type { ObjectKind, Point, Project } from './schema'

const rect = (x: number, y: number, w: number, h: number): Point[] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
]

function build(items: [ObjectKind, Point[]][]): { project: Project; ids: string[] } {
  let project = newProject('Net', 0)
  const ids: string[] = []
  for (const [kind, points] of items) {
    const added = addObject(project, kind, { type: 'polygon', points })
    project = added.project
    ids.push(added.id)
  }
  return { project, ids }
}

describe('surfaceAreas', () => {
  it('subtracts beds, paths and buildings drawn on top', () => {
    const { project, ids } = build([
      ['lawn', rect(0, 0, 10, 10)],
      ['path', rect(0, 0, 10, 1)], // 10 m², same band, later
      ['bed-ornamental', rect(2, 2, 2, 2)], // 4 m²
      ['shed', rect(6, 6, 2, 2)], // 4 m²
    ])
    expect(surfaceAreas(project, ids[0]!)).toEqual({ grossM2: 100, netM2: 82 })
  })

  it('ignores what lies below, open roofs, lines and symbols', () => {
    let { project, ids } = build([
      ['path', rect(0, 0, 10, 1)],
      ['lawn', rect(0, 0, 10, 10)], // later in the same band: the path is below it
      ['pergola', rect(2, 2, 3, 3)],
      ['carport', rect(5, 5, 3, 3)],
    ])
    project = addObject(project, 'fence', {
      type: 'polyline',
      points: [
        { x: 0, y: 5 },
        { x: 9, y: 5 },
      ],
      thicknessM: 0.05,
    }).project
    project = addObject(project, 'furniture', {
      type: 'point',
      position: { x: 1, y: 1 },
      rotationDeg: 0,
    }).project
    expect(surfaceAreas(project, ids[1]!)).toEqual({ grossM2: 100, netM2: 100 })
    expect(surfaceAreas(project, ids[0]!)?.netM2).toBe(0)
  })

  it('follows send to back', () => {
    const { project, ids } = build([
      ['lawn', rect(0, 0, 10, 10)],
      ['terrace', rect(0, 0, 5, 2)],
    ])
    expect(surfaceAreas(project, ids[0]!)?.netM2).toBe(90)
    const back = reorderItems(project, new Set([ids[1]!]), 'back')
    expect(surfaceAreas(back, ids[0]!)?.netM2).toBe(100)
    expect(surfaceAreas(back, ids[1]!)?.netM2).toBe(0)
  })

  it('gives no areas for non-surfaces', () => {
    const { project, ids } = build([
      ['shed', rect(0, 0, 3, 3)],
      ['bed-ornamental', rect(5, 5, 2, 2)],
    ])
    expect(surfaceAreas(project, ids[0]!)).toBeNull()
    expect(surfaceAreas(project, ids[1]!)).toBeNull()
    expect(surfaceAreas(project, 'nope')).toBeNull()
  })
})
