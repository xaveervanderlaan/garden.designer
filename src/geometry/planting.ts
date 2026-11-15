import type { Point } from '../model/schema'
import { boundsOfPoints } from './bounds'
import { distance, nearestPointOnSegment, pointInPolygon } from './polygon'

/**
 * Where to put plants when filling a bed or planting a row. Pure maths in metres.
 */

/** Distance from p to the nearest edge of a closed polygon. */
export function distanceToOutline(p: Point, polygon: readonly Point[]): number {
  let nearest = Infinity
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!
    const b = polygon[(i + 1) % polygon.length]!
    nearest = Math.min(nearest, nearestPointOnSegment(p, a, b).distance)
  }
  return nearest
}

/** Direction (radians, screen axes) of the polygon's longest edge: rows of a fill follow it. */
export function longestEdgeAngle(polygon: readonly Point[]): number {
  let best = 0
  let angle = 0
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!
    const b = polygon[(i + 1) % polygon.length]!
    const length = distance(a, b)
    if (length > best + 1e-9) {
      best = length
      angle = Math.atan2(b.y - a.y, b.x - a.x)
    }
  }
  return angle
}

const rotate = (p: Point, angle: number): Point => {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return { x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos }
}

/**
 * A staggered (hexagonal) pattern with `spacing` between neighbours, inside the polygon and at
 * least `margin` from its edges. Rows run in direction `angle` (radians); the pattern is centred
 * on the polygon's bounding box in that direction, so it looks balanced.
 */
export function staggeredPattern(
  polygon: readonly Point[],
  spacing: number,
  margin: number,
  angle = 0,
): Point[] {
  if (polygon.length < 3 || !(spacing > 0)) return []
  const local = polygon.map((p) => rotate(p, -angle))
  const box = boundsOfPoints(local)!
  const rowStep = (spacing * Math.sqrt(3)) / 2
  const width = box.maxX - box.minX - 2 * margin
  const height = box.maxY - box.minY - 2 * margin
  const rows = height > 0 ? Math.floor(height / rowStep + 1e-9) + 1 : 1
  const columns = width > 0 ? Math.floor(width / spacing + 1e-9) + 1 : 1
  const centre = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 }
  const firstY = centre.y - ((rows - 1) * rowStep) / 2
  const firstX = centre.x - ((columns - 1) * spacing) / 2

  const points: Point[] = []
  for (let row = 0; row < rows; row++) {
    const y = firstY + row * rowStep
    // Every other row is shifted by half the spacing (and gets one more place to try).
    const odd = row % 2 === 1
    const count = odd ? columns + 1 : columns
    const startX = odd ? firstX - spacing / 2 : firstX
    for (let column = 0; column < count; column++) {
      const p = { x: startX + column * spacing, y }
      if (!pointInPolygon(p, local)) continue
      if (distanceToOutline(p, local) < margin - 1e-9) continue
      points.push(rotate(p, angle))
    }
  }
  return points
}

/**
 * Positions to fill a bed with plants `spacing` apart, in a staggered pattern along the bed's
 * longest edge. Plants stay half the spacing from the edge, so their mature spread stays inside
 * the bed; when that leaves no room (a small bed, a big plant), the margin shrinks.
 */
export function fillPositions(polygon: readonly Point[], spacing: number): Point[] {
  if (polygon.length < 3 || !(spacing > 0)) return []
  const angle = longestEdgeAngle(polygon)
  for (const margin of [spacing / 2, spacing / 4, 0]) {
    const points = staggeredPattern(polygon, spacing, margin, angle)
    if (points.length > 0) return points
  }
  return []
}

/** Total length of an open polyline. */
export function polylineLength(points: readonly Point[]): number {
  let length = 0
  for (let i = 1; i < points.length; i++) length += distance(points[i - 1]!, points[i]!)
  return length
}

/** The point `at` metres along an open polyline (clamped to its ends). */
export function pointAlong(points: readonly Point[], at: number): Point {
  let rest = Math.max(0, at)
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    const length = distance(a, b)
    if (rest <= length || i === points.length - 1) {
      const t = length === 0 ? 0 : Math.min(1, rest / length)
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    }
    rest -= length
  }
  return points[0] ?? { x: 0, y: 0 }
}

/**
 * Positions for a row (a hedge, an edging) along a line, exactly `spacing` apart. The row is
 * centred on the line, so what's left over is split between both ends.
 */
export function rowPositions(points: readonly Point[], spacing: number): Point[] {
  if (points.length === 0 || !(spacing > 0)) return []
  const length = polylineLength(points)
  const count = Math.floor(length / spacing + 1e-9) + 1
  const start = (length - (count - 1) * spacing) / 2
  return Array.from({ length: count }, (_, i) => pointAlong(points, start + i * spacing))
}
