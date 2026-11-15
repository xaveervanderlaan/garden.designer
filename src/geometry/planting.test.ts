import { describe, expect, it } from 'vitest'
import {
  distanceToOutline,
  fillPositions,
  longestEdgeAngle,
  pointAlong,
  polylineLength,
  rowPositions,
  staggeredPattern,
} from './planting'
import { distance, pointInPolygon } from './polygon'

const rect = (w: number, h: number, x = 0, y = 0) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
]

/** Smallest distance between any two points. */
function minGap(points: ReadonlyArray<{ x: number; y: number }>): number {
  let gap = Infinity
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++)
      gap = Math.min(gap, distance(points[i]!, points[j]!))
  }
  return gap
}

describe('fillPositions', () => {
  it('fills a rectangle in a staggered pattern, the spacing apart and inside the margin', () => {
    const bed = rect(4, 2)
    const points = fillPositions(bed, 0.5)
    // Rows 0.433 m apart in 1.5 m of usable depth: 4 rows of alternately 8 and 7 or 8 plants.
    expect(points.length).toBeGreaterThanOrEqual(28)
    expect(points.length).toBeLessThanOrEqual(32)
    expect(minGap(points)).toBeCloseTo(0.5, 6)
    for (const p of points) {
      expect(pointInPolygon(p, bed)).toBe(true)
      expect(distanceToOutline(p, bed)).toBeGreaterThanOrEqual(0.25 - 1e-9)
    }
    // Every other row is shifted by half the spacing.
    const rows = [...new Set(points.map((p) => p.y.toFixed(6)))]
    expect(rows).toHaveLength(4)
    const firstX = (row: string) =>
      Math.min(...points.filter((p) => p.y.toFixed(6) === row).map((p) => p.x))
    expect(Math.abs(firstX(rows[0]!) - firstX(rows[1]!))).toBeCloseTo(0.25, 6)
  })

  it('is centred in the bed', () => {
    const points = fillPositions(rect(3, 3, 10, 20), 1)
    const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length
    const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length
    expect(cx).toBeCloseTo(11.5, 0)
    expect(cy).toBeCloseTo(21.5, 1)
  })

  it('runs the rows along the longest edge of a slanted bed', () => {
    // A 6 × 1 m strip at 30°.
    const angle = Math.PI / 6
    const along = { x: Math.cos(angle), y: Math.sin(angle) }
    const across = { x: -Math.sin(angle), y: Math.cos(angle) }
    const strip = [
      { x: 0, y: 0 },
      { x: 6 * along.x, y: 6 * along.y },
      { x: 6 * along.x + across.x, y: 6 * along.y + across.y },
      { x: across.x, y: across.y },
    ]
    expect(longestEdgeAngle(strip)).toBeCloseTo(angle, 9)
    const points = fillPositions(strip, 1)
    // One row of 6 plants down the middle (margin 0.5 m), not a few diagonal stubs.
    expect(points).toHaveLength(6)
    for (const p of points) expect(distanceToOutline(p, strip)).toBeCloseTo(0.5, 6)
  })

  it('handles concave beds: nothing in the cut-out corner', () => {
    const l = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 2 },
      { x: 2, y: 2 },
      { x: 2, y: 4 },
      { x: 0, y: 4 },
    ]
    const points = fillPositions(l, 0.5)
    expect(points.length).toBeGreaterThan(20)
    for (const p of points) expect(pointInPolygon(p, l)).toBe(true)
    expect(points.some((p) => p.x > 2.1 && p.y > 2.1)).toBe(false)
  })

  it('shrinks the margin when a big plant would not fit otherwise', () => {
    // A 1 m wide strip and plants 2 m apart: with a 1 m margin nothing fits.
    expect(staggeredPattern(rect(5, 1), 2, 1)).toEqual([])
    const points = fillPositions(rect(5, 1), 2)
    expect(points.length).toBeGreaterThanOrEqual(2)
    for (const p of points) expect(p.y).toBeCloseTo(0.5, 6)
  })

  it('gives nothing for a degenerate bed or spacing', () => {
    expect(fillPositions(rect(2, 2).slice(0, 2), 0.5)).toEqual([])
    expect(fillPositions(rect(2, 2), 0)).toEqual([])
    expect(fillPositions(rect(2, 2), -1)).toEqual([])
  })
})

describe('rowPositions', () => {
  it('plants exactly the spacing apart, centred on the line', () => {
    const points = rowPositions(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      0.6,
    )
    expect(points).toHaveLength(17) // 16 × 0.6 = 9.6, so 0.2 m to spare at each end
    expect(points[0]!.x).toBeCloseTo(0.2, 9)
    expect(points.at(-1)!.x).toBeCloseTo(9.8, 9)
    expect(minGap(points)).toBeCloseTo(0.6, 9)
  })

  it('includes both ends when the length is a whole number of spacings', () => {
    const points = rowPositions(
      [
        { x: 0, y: 0 },
        { x: 0, y: 3 },
      ],
      1,
    )
    expect(points.map((p) => p.y)).toEqual([0, 1, 2, 3])
  })

  it('follows a line round its corners', () => {
    const line = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
    ]
    expect(polylineLength(line)).toBe(4)
    expect(pointAlong(line, 3)).toEqual({ x: 2, y: 1 })
    expect(pointAlong(line, 10)).toEqual({ x: 2, y: 2 })
    const points = rowPositions(line, 1)
    expect(points).toHaveLength(5)
    expect(points[3]).toEqual({ x: 2, y: 1 })
  })

  it('gives one plant for a line of one point, none without a spacing', () => {
    expect(rowPositions([{ x: 1, y: 1 }], 0.5)).toEqual([{ x: 1, y: 1 }])
    expect(rowPositions([{ x: 1, y: 1 }], 0)).toEqual([])
  })
})
