import { describe, expect, it } from 'vitest'
import {
  angleDeg,
  direction,
  edgeLengths,
  isSelfIntersecting,
  nearestPointOnSegment,
  perimeter,
  pointAt,
  pointInPolygon,
  polygonArea,
  roundPoint,
  segmentsIntersect,
  signedArea,
} from './polygon'

const rect = (w: number, h: number) => [
  { x: 0, y: 0 },
  { x: w, y: 0 },
  { x: w, y: h },
  { x: 0, y: h },
]
/** An L-shape: 10 × 10 with a 5 × 5 corner cut out (area 75). */
const lShape = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 5 },
  { x: 5, y: 5 },
  { x: 5, y: 10 },
  { x: 0, y: 10 },
]

describe('area and perimeter', () => {
  it('computes the shoelace area, regardless of direction', () => {
    expect(polygonArea(rect(20, 15))).toBe(300)
    expect(polygonArea([...rect(20, 15)].reverse())).toBe(300)
    expect(polygonArea(lShape)).toBe(75)
    expect(polygonArea(rect(20, 15).slice(0, 2))).toBe(0)
  })

  it('knows the orientation from the sign', () => {
    expect(signedArea(rect(2, 2))).toBeGreaterThan(0) // clockwise on screen (y down)
    expect(signedArea([...rect(2, 2)].reverse())).toBeLessThan(0)
  })

  it('measures edges and the perimeter', () => {
    expect(edgeLengths(rect(20, 15))).toEqual([20, 15, 20, 15])
    expect(edgeLengths(rect(20, 15), false)).toEqual([20, 15, 20])
    expect(perimeter(rect(20, 15))).toBe(70)
    expect(perimeter(lShape)).toBe(40)
  })
})

describe('pointInPolygon', () => {
  it('tells inside from outside, also in a concave shape', () => {
    expect(pointInPolygon({ x: 2, y: 2 }, lShape)).toBe(true)
    expect(pointInPolygon({ x: 7, y: 7 }, lShape)).toBe(false) // in the cut-out
    expect(pointInPolygon({ x: 11, y: 2 }, lShape)).toBe(false)
  })
})

describe('intersections', () => {
  const p = (x: number, y: number) => ({ x, y })

  it('detects crossing and touching segments', () => {
    expect(segmentsIntersect(p(0, 0), p(4, 4), p(0, 4), p(4, 0))).toBe(true)
    expect(segmentsIntersect(p(0, 0), p(4, 0), p(2, 0), p(2, 3))).toBe(true) // T-junction
    expect(segmentsIntersect(p(0, 0), p(4, 0), p(0, 1), p(4, 1))).toBe(false) // parallel
    expect(segmentsIntersect(p(0, 0), p(1, 0), p(2, 0), p(3, 0))).toBe(false) // collinear, apart
  })

  it('flags self-intersecting outlines only', () => {
    expect(isSelfIntersecting(rect(20, 15))).toBe(false)
    expect(isSelfIntersecting(lShape)).toBe(false)
    const bowtie = [p(0, 0), p(4, 4), p(4, 0), p(0, 4)]
    expect(isSelfIntersecting(bowtie)).toBe(true)
  })

  it('finds the nearest point on a segment', () => {
    expect(nearestPointOnSegment(p(5, 3), p(0, 0), p(10, 0))).toEqual({
      point: p(5, 0),
      t: 0.5,
      distance: 3,
    })
    expect(nearestPointOnSegment(p(-2, 0), p(0, 0), p(10, 0)).point).toEqual(p(0, 0))
  })
})

describe('angles', () => {
  const o = { x: 0, y: 0 }

  it('uses map angles: 0° right, 90° up (y points down on screen)', () => {
    expect(angleDeg(o, { x: 1, y: 0 })).toBe(0)
    expect(angleDeg(o, { x: 0, y: -1 })).toBe(90)
    expect(angleDeg(o, { x: -1, y: 0 })).toBe(180)
    expect(angleDeg(o, { x: 0, y: 1 })).toBe(270)
  })

  it('goes from angle to direction and point', () => {
    const d = direction(90)
    expect(d.x).toBeCloseTo(0)
    expect(d.y).toBeCloseTo(-1)
    expect(roundPoint(pointAt({ x: 1, y: 1 }, 270, 15))).toEqual({ x: 1, y: 16 })
  })

  it('rounds coordinates to a micrometre', () => {
    expect(roundPoint({ x: 11.9999999999998, y: -1e-12 })).toEqual({ x: 12, y: 0 })
  })
})
