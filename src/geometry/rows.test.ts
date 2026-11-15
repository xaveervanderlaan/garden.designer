import { describe, expect, it } from 'vitest'
import type { Point } from '../model/schema'
import { direction, nearestPointOnSegment, pointInPolygon } from './polygon'
import { defaultRowAngle, layoutRows, normaliseRowAngle, rowPositions } from './rows'

const rect = (w: number, h: number): Point[] => [
  { x: 0, y: 0 },
  { x: w, y: 0 },
  { x: w, y: h },
  { x: 0, y: h },
]
/** An L-shape: 10 × 10 with the bottom-right 5 × 5 cut out (area 75). */
const lShape: Point[] = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 5 },
  { x: 5, y: 5 },
  { x: 5, y: 10 },
  { x: 0, y: 10 },
]
/** A U-shape, open at the top: two 3 m wide arms either side of a 4 m notch. */
const uShape: Point[] = [
  { x: 0, y: 0 },
  { x: 3, y: 0 },
  { x: 3, y: 4 },
  { x: 7, y: 4 },
  { x: 7, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 6 },
  { x: 0, y: 6 },
]

/** The outline turned `degrees` (map-style) about the origin. */
const rotated = (points: Point[], degrees: number): Point[] => {
  const u = direction(degrees)
  const v = direction(degrees - 90)
  return points.map(({ x, y }) => ({ x: x * u.x + y * v.x, y: x * u.y + y * v.y }))
}

/** Distance from p to the nearest edge of the outline. */
const edgeDistance = (p: Point, outline: Point[]) =>
  Math.min(
    ...outline.map(
      (a, i) => nearestPointOnSegment(p, a, outline[(i + 1) % outline.length]!).distance,
    ),
  )

const expectInside = (positions: Point[], outline: Point[], marginM: number) => {
  for (const p of positions) {
    expect(pointInPolygon(p, outline), JSON.stringify(p)).toBe(true)
    expect(edgeDistance(p, outline)).toBeGreaterThanOrEqual(marginM - 1e-6)
  }
}

describe('layoutRows', () => {
  it('fills a rectangle with rows half a spacing from the edges', () => {
    const pieces = layoutRows(rect(4, 2), { angleDeg: 0, rowSpacingM: 0.5, inRowSpacingM: 0.25 })
    expect(pieces).toHaveLength(4)
    expect(pieces.map((p) => p.positions[0]!.y)).toEqual([0.25, 0.75, 1.25, 1.75])
    for (const piece of pieces) {
      expect(piece.positions).toHaveLength(16)
      expect(piece.positions[0]!.x).toBeCloseTo(0.125)
      expect(piece.positions.at(-1)!.x).toBeCloseTo(3.875)
      expect(piece.start.x).toBeCloseTo(0)
      expect(piece.end.x).toBeCloseTo(4)
    }
    expect(rowPositions(pieces)).toHaveLength(64)
  })

  it('centres rows and plants in the room that is left', () => {
    const pieces = layoutRows(rect(1.1, 1.2), { angleDeg: 0, rowSpacingM: 0.5, inRowSpacingM: 0.5 })
    expect(pieces.map((p) => p.positions[0]!.y)).toEqual([0.35, 0.85])
    expect(pieces[0]!.positions.map((p) => p.x)).toEqual([0.3, 0.8])
  })

  it('runs rows across the bed for a perpendicular direction, either way round', () => {
    const across = layoutRows(rect(4, 2), { angleDeg: 90, rowSpacingM: 0.5, inRowSpacingM: 0.25 })
    expect(across).toHaveLength(8)
    expect(across[0]!.positions).toHaveLength(8)
    const reversed = layoutRows(rect(4, 2), {
      angleDeg: 270,
      rowSpacingM: 0.5,
      inRowSpacingM: 0.25,
    })
    expect(rowPositions(reversed)).toHaveLength(64)
  })

  it('lays out a rotated rectangle like an upright one', () => {
    const bed = rotated(rect(4, 2), 30)
    const pieces = layoutRows(bed, { angleDeg: 30, rowSpacingM: 0.5, inRowSpacingM: 0.25 })
    expect(pieces).toHaveLength(4)
    expect(pieces.every((p) => p.positions.length === 16)).toBe(true)
    expectInside(rowPositions(pieces), bed, 0.125)
  })

  it('keeps plants inside when rows run at a slant to the edges', () => {
    const bed = rect(4, 3)
    const positions = rowPositions(
      layoutRows(bed, { angleDeg: 37, rowSpacingM: 0.4, inRowSpacingM: 0.3 }),
    )
    expect(positions.length).toBeGreaterThan(40)
    expectInside(positions, bed, 0.15)
  })

  it('fills a concave L-shape', () => {
    const pieces = layoutRows(lShape, { angleDeg: 0, rowSpacingM: 1, inRowSpacingM: 1 })
    expect(pieces).toHaveLength(10)
    expect(pieces.map((p) => p.positions.length)).toEqual([10, 10, 10, 10, 10, 5, 5, 5, 5, 5])
    expectInside(rowPositions(pieces), lShape, 0.5)
  })

  it('splits a row in pieces where it crosses a notch', () => {
    const pieces = layoutRows(uShape, { angleDeg: 0, rowSpacingM: 1, inRowSpacingM: 1 })
    expect(pieces.map((p) => p.row)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 5])
    const [left, right] = pieces
    expect(left!.positions.map((p) => p.x)).toEqual([0.5, 1.5, 2.5])
    expect(right!.positions.map((p) => p.x)).toEqual([7.5, 8.5, 9.5])
    expect(left!.end.x).toBeCloseTo(3)
    expect(right!.start.x).toBeCloseTo(7)
    expect(pieces.at(-1)!.positions).toHaveLength(10)
    expectInside(rowPositions(pieces), uShape, 0.5)
  })

  it('returns nothing for a bed that is too small, or for bad input', () => {
    const options = { angleDeg: 0, rowSpacingM: 0.5, inRowSpacingM: 0.25 }
    expect(layoutRows(rect(0.3, 0.3), options)).toEqual([])
    expect(layoutRows(rect(4, 0.4), options)).toEqual([])
    expect(layoutRows(rect(4, 2).slice(0, 2), options)).toEqual([])
    expect(layoutRows(rect(4, 2), { ...options, rowSpacingM: 0 })).toEqual([])
    expect(layoutRows(rect(4, 2), { ...options, angleDeg: Number.NaN })).toEqual([])
  })

  it('fits a single plant in a bed exactly one spacing in size', () => {
    const pieces = layoutRows(rect(0.5, 0.5), { angleDeg: 0, rowSpacingM: 0.5, inRowSpacingM: 0.5 })
    expect(rowPositions(pieces)).toEqual([{ x: 0.25, y: 0.25 }])
  })

  it('stops at maxPositions', () => {
    const pieces = layoutRows(rect(10, 10), {
      angleDeg: 0,
      rowSpacingM: 0.1,
      inRowSpacingM: 0.1,
      maxPositions: 250,
    })
    expect(rowPositions(pieces)).toHaveLength(250)
  })
})

describe('row direction', () => {
  it('defaults to the longest edge', () => {
    expect(defaultRowAngle(rect(4, 2))).toBe(0)
    expect(defaultRowAngle(rect(2, 4))).toBe(90)
    expect(defaultRowAngle(rotated(rect(4, 2), 30))).toBeCloseTo(30)
    expect(defaultRowAngle(rotated(rect(4, 2), 200))).toBeCloseTo(20)
    expect(defaultRowAngle([])).toBe(0)
  })

  it('normalises to [0, 180)', () => {
    expect(normaliseRowAngle(180)).toBe(0)
    expect(normaliseRowAngle(270)).toBe(90)
    expect(normaliseRowAngle(-30)).toBe(150)
    expect(normaliseRowAngle(179.99999999)).toBe(0)
  })
})
