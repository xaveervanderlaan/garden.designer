import { describe, expect, it } from 'vitest'
import { shapeFrameBox } from '../geometry/frame'
import { newProject } from './defaults'
import {
  addObject,
  defaultFootprint,
  findObject,
  objectRotation,
  resizeObject,
  rotateObjectTo,
  setHedgePlant,
  setObjectKind,
  setObjectMaterial,
  setObjectStatus,
  setObjectVariant,
  shapeForKind,
} from './objects'
import { symbolFor } from './objectKinds'
import type { Point, Project } from './schema'
import { designWarnings } from './warnings'

const rect = (x: number, y: number, w: number, h: number): Point[] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
]

const poly = (points: Point[]) => ({ type: 'polygon' as const, points })

function withShed(): { project: Project; id: string } {
  return addObject(newProject('Objects', 0), 'shed', poly(rect(2, 2, 4, 3)))
}

describe('objects', () => {
  it('adds a house from its preset as existing, on the existing layer', () => {
    const { project, id } = addObject(newProject('x', 0), 'house', poly(rect(0, 0, 10, 8)))
    expect(findObject(project, id)).toMatchObject({
      kind: 'house',
      status: 'existing',
      layer: 'existing',
      heightM: 8,
    })
  })

  it('adds a shed as new with its preset height', () => {
    const { project, id } = withShed()
    expect(findObject(project, id)).toMatchObject({
      kind: 'shed',
      status: 'new',
      layer: 'hardscape',
      heightM: 2.4,
    })
  })

  it('builds a polyline with the preset thickness and refuses too few points', () => {
    const line = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
    ]
    expect(shapeForKind('fence', line)).toEqual({
      type: 'polyline',
      points: line,
      thicknessM: 0.05,
    })
    expect(shapeForKind('fence', line.slice(0, 1))).toBeNull()
    expect(shapeForKind('shed', line)).toBeNull()
    expect(shapeForKind('furniture', line)).toMatchObject({ type: 'point', position: line[0] })
  })

  it('places the default footprint centred on a point', () => {
    const points = defaultFootprint('shed', { x: 10, y: 10 })!
    expect(points).toEqual(rect(8.5, 8.75, 3, 2.5))
    expect(defaultFootprint('fence', { x: 0, y: 0 })).toBeNull()
  })

  it('keeps objects outside the plot without warnings', () => {
    const { project, id } = addObject(newProject('x', 0), 'house', poly(rect(-50, -50, 10, 8)))
    expect(findObject(project, id)!.shape).toMatchObject({ points: rect(-50, -50, 10, 8) })
    expect(designWarnings(project)).toEqual([])
  })

  it("resizes along the object's own frame", () => {
    const { project, id } = withShed()
    const turned = rotateObjectTo(project, id, 30)
    const resized = resizeObject(turned, id, { widthM: 6 })
    const box = shapeFrameBox(findObject(resized, id)!.shape)
    expect(box.width).toBeCloseTo(6, 2)
    expect(box.depth).toBeCloseTo(3, 2)
    const before = shapeFrameBox(findObject(turned, id)!.shape)
    expect(box.centre.x).toBeCloseTo(before.centre.x, 2)
    expect(box.centre.y).toBeCloseTo(before.centre.y, 2)
    expect(resizeObject(project, id, {})).toBe(project)
  })

  it('rotates to an angle and back', () => {
    const { project, id } = withShed()
    const turned = rotateObjectTo(project, id, 30)
    expect(objectRotation(findObject(turned, id)!.shape)).toBeCloseTo(30, 2)
    const back = rotateObjectTo(turned, id, 0)
    expect(objectRotation(findObject(back, id)!.shape)).toBeCloseTo(0, 2)
    const points = (findObject(back, id)!.shape as { points: Point[] }).points
    expect(points[0]!.x).toBeCloseTo(2, 1)
    expect(points[0]!.y).toBeCloseTo(2, 1)
  })

  it('moves an object to the other layer when its status changes', () => {
    const { project, id } = withShed()
    const existing = setObjectStatus(project, new Set([id]), 'existing')
    expect(findObject(existing, id)).toMatchObject({ status: 'existing', layer: 'existing' })
    const again = setObjectStatus(existing, new Set([id]), 'new')
    expect(findObject(again, id)).toMatchObject({ status: 'new', layer: 'hardscape' })
    expect(setObjectStatus(again, new Set([id]), 'new')).toBe(again)
  })

  const line = {
    type: 'polyline' as const,
    points: [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
    ],
    thicknessM: 0.6,
  }

  it("sets a material only from the kind's list", () => {
    const { project, id } = addObject(newProject('x', 0), 'terrace', poly(rect(0, 0, 4, 3)))
    expect(findObject(setObjectMaterial(project, id, 'wood'), id)?.material).toBe('wood')
    expect(setObjectMaterial(project, id, 'grass')).toBe(project)
  })

  it('stores a symbol variant and falls back to the first', () => {
    const at = { type: 'point' as const, position: { x: 1, y: 1 }, rotationDeg: 0 }
    const { project, id } = addObject(newProject('x', 0), 'furniture', at, { variant: 'bench' })
    expect(findObject(project, id)?.variant).toBe('bench')
    expect(findObject(setObjectVariant(project, id, 'lounger'), id)?.variant).toBe('lounger')
    expect(setObjectVariant(project, id, 'swing')).toBe(project)
    expect(symbolFor('furniture', 'nope')?.id).toBe('dining-set')
    expect(symbolFor('furniture')?.id).toBe('dining-set')
    expect(symbolFor('terrace')).toBeNull()
    const terrace = addObject(newProject('x', 0), 'terrace', poly(rect(0, 0, 4, 3)), {
      variant: 'bench',
    })
    expect(findObject(terrace.project, terrace.id)?.variant).toBeUndefined()
  })

  it('links a hedge to a hedging species only', () => {
    const { project, id } = addObject(newProject('x', 0), 'hedge', line)
    const linked = setHedgePlant(project, id, 'carpinus-betulus')
    expect(findObject(linked, id)?.plantId).toBe('carpinus-betulus')
    expect(setHedgePlant(project, id, 'betula-pendula')).toBe(project)
    expect(setHedgePlant(project, id, 'unknown')).toBe(project)
    expect(findObject(setHedgePlant(linked, id, null), id)).not.toHaveProperty('plantId')
    const fence = addObject(newProject('x', 0), 'fence', line)
    expect(setHedgePlant(fence.project, fence.id, 'carpinus-betulus')).toBe(fence.project)
  })

  it('drops material, variant and hedge plant that the new kind lacks', () => {
    const hedge = addObject(newProject('x', 0), 'hedge', line)
    const linked = setHedgePlant(hedge.project, hedge.id, 'carpinus-betulus')
    const fence = setObjectKind(linked, hedge.id, 'fence')
    expect(findObject(fence, hedge.id)).not.toHaveProperty('plantId')
    expect(setObjectKind(fence, hedge.id, 'hedge')).toBeDefined()

    const t = addObject(newProject('x', 0), 'terrace', poly(rect(0, 0, 4, 3)))
    const wood = setObjectMaterial(t.project, t.id, 'natural-stone')
    expect(findObject(setObjectKind(wood, t.id, 'path'), t.id)?.material).toBe('natural-stone')
    expect(findObject(setObjectKind(wood, t.id, 'lawn'), t.id)).not.toHaveProperty('material')

    const f = addObject(
      newProject('x', 0),
      'furniture',
      { type: 'point', position: { x: 1, y: 1 }, rotationDeg: 0 },
      { variant: 'parasol' },
    )
    expect(findObject(setObjectKind(f.project, f.id, 'lighting'), f.id)).not.toHaveProperty(
      'variant',
    )
  })
})
