import { describe, expect, it } from 'vitest'
import type { Point } from '../model/schema'
import { pointInPolygon } from './polygon'
import {
  type Caster,
  castShadows,
  mergePieces,
  type MultiPolygon,
  multiPolygonArea,
  pointInPieces,
  pointInRing,
  polylineFootprint,
  prismFromPolygon,
  prismFromPolyline,
  shadowAt,
  shadowPieces,
  toSvgPath,
  treeCaster,
} from './shadows'

const rect = (x: number, y: number, w: number, h: number): Point[] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
]
/** 10 × 10 with the 5 × 5 bottom-right corner cut out (area 75). */
const lShape: Point[] = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 5 },
  { x: 5, y: 5 },
  { x: 5, y: 10 },
  { x: 0, y: 10 },
]
/** Sun at 45° in the south with north up: shadows fall 1 m up the screen per metre of height. */
const NOON_45: Point = { x: 0, y: -1 }

function boxOf(points: Point[]) {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  }
}
const bounds = (shape: MultiPolygon) => boxOf(shape.flat(2).map(([x, y]) => ({ x, y })))
const circleBox = (c: Point, r: number) => ({
  minX: c.x - r,
  minY: c.y - r,
  maxX: c.x + r,
  maxY: c.y + r,
})

/** Reference: a point is in the shadow if a point of the caster sits on its line to the sun. */
function inShadowBruteForce(casters: Caster[], step: Point, p: Point, samples = 1000): boolean {
  return casters.some((caster) => {
    const [from, to] =
      caster.kind === 'prism' ? [caster.baseM ?? 0, caster.heightM] : [caster.baseM, caster.topM]
    const box =
      caster.kind === 'canopy'
        ? circleBox(caster.centre, caster.radiusM)
        : boxOf(caster.footprint.flat(2).map(([x, y]) => ({ x, y })))
    for (let i = 0; i <= samples; i++) {
      const z = from + ((to - from) * i) / samples
      const foot = { x: p.x - step.x * z, y: p.y - step.y * z }
      if (foot.x < box.minX || foot.x > box.maxX || foot.y < box.minY || foot.y > box.maxY) continue
      if (caster.kind === 'canopy') {
        if (Math.hypot(foot.x - caster.centre.x, foot.y - caster.centre.y) <= caster.radiusM) {
          return true
        }
      } else {
        const inside = caster.footprint.some(
          (polygon) => polygon.filter((ring) => pointInRing(foot.x, foot.y, ring)).length % 2 === 1,
        )
        if (inside) return true
      }
    }
    return false
  })
}

/** A tiny deterministic random generator (mulberry32). */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('prism shadows', () => {
  it('casts a shadow h / tan(altitude) long, away from the sun', () => {
    const wall = prismFromPolygon(rect(0, 0, 10, 0.2), 2)
    // Sun at 30° in the south: the shadow reaches 2 / tan(30°) = 3.46 m north (up).
    const step = { x: 0, y: -1 / Math.tan(Math.PI / 6) }
    const shadow = castShadows([wall], step)
    expect(shadow).toHaveLength(1)
    expect(bounds(shadow).minY).toBeCloseTo(-2 * Math.sqrt(3), 9)
    expect(bounds(shadow).maxY).toBeCloseTo(0.2, 9)
    expect(multiPolygonArea(shadow)).toBeCloseTo(10 * (0.2 + 2 * Math.sqrt(3)), 9)
    // A box 2 × 2, 3 m high, with the sun at 45°: a 2 × 5 rectangle.
    expect(
      multiPolygonArea(castShadows([prismFromPolygon(rect(0, 0, 2, 2), 3)], NOON_45)),
    ).toBeCloseTo(10, 9)
  })

  it('handles a concave (L-shaped) footprint', () => {
    // Shadow towards the bottom right by (2, 2). The cut-out corner is shaded except where
    // x > 7 and y > 7, and two 12 m² wedges stick out beyond the right and bottom edges.
    const house = prismFromPolygon(lShape, 2)
    const shadow = castShadows([house], { x: 1, y: 1 })
    expect(shadow).toHaveLength(1)
    expect(multiPolygonArea(shadow)).toBeCloseTo(75 + 16 + 12 + 12, 6)
    const pieces = shadowPieces([house], { x: 1, y: 1 })
    expect(pointInPieces(pieces, { x: 6, y: 9 })).toBe(true)
    expect(pointInPieces(pieces, { x: 8, y: 8 })).toBe(false)
    expect(pointInPieces(pieces, { x: 11, y: 6 })).toBe(true)
    expect(pointInPieces(pieces, { x: 11.5, y: 8 })).toBe(false)
  })

  it('merges overlapping shadows into one', () => {
    const a = prismFromPolygon(rect(0, 0, 2, 2), 3)
    const b = prismFromPolygon(rect(1, 0, 2, 2), 3)
    const shadow = castShadows([a, b], NOON_45)
    expect(shadow).toHaveLength(1)
    expect(multiPolygonArea(shadow)).toBeCloseTo(3 * 5, 9)
    // Apart, they stay two polygons.
    expect(castShadows([a, prismFromPolygon(rect(10, 0, 2, 2), 3)], NOON_45)).toHaveLength(2)
  })

  it('lets light under a roof on posts when the sun is low', () => {
    const carport = prismFromPolygon(rect(0, 0, 3, 5), 2.5, 2.2)
    const pieces = shadowPieces([carport], { x: 0, y: -3 })
    expect(pointInPieces(pieces, { x: 1.5, y: 2.5 })).toBe(false) // under the roof
    expect(pointInPieces(pieces, { x: 1.5, y: -5 })).toBe(true) // where the roof's shadow lands
  })

  it('casts nothing when the sun is down', () => {
    const box = prismFromPolygon(rect(0, 0, 2, 2), 3)
    expect(shadowAt([box], { altitudeDeg: -2, azimuthDeg: 0 }, 0)).toEqual([])
    expect(shadowAt([box], { altitudeDeg: 45, azimuthDeg: 180 }, 0)).toHaveLength(1)
  })

  it('agrees with a brute-force check on random scenes', () => {
    const rand = random(7)
    const between = (a: number, b: number) => a + (b - a) * rand()
    for (let scene = 0; scene < 6; scene++) {
      const casters: Caster[] = []
      for (let i = 0; i < 4; i++) {
        // A random star-shaped polygon (often concave), a random fence and a random tree.
        const centre = { x: between(0, 20), y: between(0, 20) }
        const corners = Array.from({ length: 7 }, (_, k) => {
          const angle = (2 * Math.PI * k) / 7
          const r = between(1, 4)
          return { x: centre.x + r * Math.cos(angle), y: centre.y + r * Math.sin(angle) }
        })
        casters.push(prismFromPolygon(corners, between(1, 6)))
      }
      casters.push(
        prismFromPolyline(
          [
            { x: between(0, 20), y: between(0, 20) },
            { x: between(0, 20), y: between(0, 20) },
            { x: between(0, 20), y: between(0, 20) },
          ],
          0.3,
          1.8,
        ),
      )
      casters.push(treeCaster({ x: between(0, 20), y: between(0, 20) }, 5, 9))
      const step = { x: between(-2, 2), y: between(-2, 2) }
      const pieces = shadowPieces(casters, step)
      const merged = castShadows(casters, step)
      let disagreements = 0
      for (let i = 0; i < 400; i++) {
        const p = { x: between(-10, 30), y: between(-10, 30) }
        const expected = inShadowBruteForce(casters, step, p)
        if (pointInPieces(pieces, p) !== expected) disagreements++
        const inMerged = merged.some(
          (polygon) => polygon.filter((ring) => pointInRing(p.x, p.y, ring)).length % 2 === 1,
        )
        // The merged polygon approximates circles, so allow a few misses near curved edges.
        if (inMerged !== expected) disagreements += 0.25
      }
      expect(disagreements).toBeLessThanOrEqual(4)
    }
  })
})

describe('polyline footprints', () => {
  it('buffers a straight line with round ends', () => {
    const footprint = polylineFootprint(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      0.2,
    )
    expect(footprint).toHaveLength(1)
    expect(bounds(footprint)).toEqual({ minX: -0.1, minY: -0.1, maxX: 10.1, maxY: 0.1 })
    expect(multiPolygonArea(footprint)).toBeCloseTo(2 + Math.PI * 0.01, 2)
  })

  it('joins segments with a round corner', () => {
    const footprint = polylineFootprint(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 5 },
      ],
      1,
    )
    expect(footprint).toHaveLength(1)
    expect(footprint[0]).toHaveLength(1) // no holes
    // 15 m × 1 m, plus two half-disc ends and a quarter-disc corner, minus the overlap.
    expect(multiPolygonArea(footprint)).toBeCloseTo(14.75 + Math.PI / 4 + Math.PI / 16, 1)
    const ring = footprint[0]![0]!
    expect(pointInRing(10.3, -0.3, ring)).toBe(true) // within the rounded corner
    expect(pointInRing(10.45, -0.45, ring)).toBe(false) // where a mitred corner would be
  })

  it('turns a closed loop into a ring with a hole', () => {
    const fence = [...rect(0, 0, 10, 10), { x: 0, y: 0 }]
    const footprint = polylineFootprint(fence, 0.2)
    expect(footprint).toHaveLength(1)
    expect(footprint[0]).toHaveLength(2)
    expect(multiPolygonArea(footprint)).toBeCloseTo(10.2 * 10.2 - 9.8 * 9.8, 1)
  })

  it('casts a shadow into the yard it encloses', () => {
    const fence = prismFromPolyline([...rect(0, 0, 10, 10), { x: 0, y: 0 }], 0.2, 2)
    const pieces = shadowPieces([fence], NOON_45)
    // The south fence (y = 10) shades 2 m of the yard north of it; the middle stays sunny.
    expect(pointInPieces(pieces, { x: 5, y: 8.5 })).toBe(true)
    expect(pointInPieces(pieces, { x: 5, y: 7.5 })).toBe(false)
    expect(pointInPieces(pieces, { x: 5, y: 5 })).toBe(false)
    expect(pointInPieces(pieces, { x: 5, y: -1.5 })).toBe(true) // north of the north fence
    const merged = mergePieces(pieces)
    expect(merged.some((polygon) => polygon.length === 2)).toBe(true) // the lit part is a hole
  })
})

describe('tree shadows', () => {
  it('casts a capsule from the canopy, leaving the trunk in the sun', () => {
    // Canopy from 3 to 9 m, radius 2, sun at 45°: discs at 3 and 9 m north of the trunk.
    const tree = treeCaster({ x: 0, y: 0 }, 4, 9)
    expect(tree).toMatchObject({ radiusM: 2, baseM: 3, topM: 9 })
    const pieces = shadowPieces([tree], NOON_45)
    expect(pieces).toEqual([
      expect.objectContaining({ kind: 'capsule', a: { x: 0, y: -3 }, b: { x: 0, y: -9 } }),
    ])
    expect(pointInPieces(pieces, { x: 0, y: 0 })).toBe(false)
    expect(pointInPieces(pieces, { x: 0, y: -6 })).toBe(true)
    expect(pointInPieces(pieces, { x: 1.9, y: -6 })).toBe(true)
    expect(pointInPieces(pieces, { x: 2.1, y: -6 })).toBe(false)
    const shadow = mergePieces(pieces)
    expect(shadow).toHaveLength(1)
    expect(multiPolygonArea(shadow)).toBeCloseTo(Math.PI * 4 + 4 * 6, 0)
    expect(bounds(shadow).minY).toBeCloseTo(-11, 9)
    expect(bounds(shadow).maxX).toBeCloseTo(2, 9)
  })
})

describe('output helpers', () => {
  it('writes SVG path data', () => {
    expect(
      toSvgPath([
        [
          [
            [0, 0],
            [1, 0],
            [1, 1],
          ],
        ],
      ]),
    ).toBe('M0 0L1 0L1 1Z')
  })

  it('returns open rings, outer rings counter-clockwise in maths terms', () => {
    const [polygon] = castShadows([prismFromPolygon(lShape, 2)], { x: 1, y: 1 })
    const ring = polygon![0]!
    expect(ring[0]).not.toEqual(ring[ring.length - 1])
    const area = ring.reduce((sum, [x, y], i) => {
      const [nx, ny] = ring[(i + 1) % ring.length]!
      return sum + x * ny - nx * y
    }, 0)
    expect(area).toBeGreaterThan(0)
    expect(
      pointInPolygon(
        { x: 1, y: 1 },
        ring.map(([x, y]) => ({ x, y })),
      ),
    ).toBe(true)
  })
})
