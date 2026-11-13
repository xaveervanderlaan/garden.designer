import type { Point } from '../model/schema'

/** Pure polygon maths. Points are in metres; y points down (screen convention). */

export const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y)

/** Signed shoelace area: positive when the points run clockwise on screen (y down). */
export function signedArea(points: readonly Point[]): number {
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!
    const b = points[(i + 1) % points.length]!
    sum += a.x * b.y - b.x * a.y
  }
  return sum / 2
}

export function polygonArea(points: readonly Point[]): number {
  return points.length < 3 ? 0 : Math.abs(signedArea(points))
}

/** Length of every edge; edge i runs from point i to point i + 1 (wrapping when closed). */
export function edgeLengths(points: readonly Point[], closed = true): number[] {
  const count = closed ? points.length : points.length - 1
  const lengths: number[] = []
  for (let i = 0; i < count; i++)
    lengths.push(distance(points[i]!, points[(i + 1) % points.length]!))
  return lengths
}

export function perimeter(points: readonly Point[], closed = true): number {
  return edgeLengths(points, closed).reduce((sum, length) => sum + length, 0)
}

/** Even-odd ray casting. Points exactly on an edge may go either way. */
export function pointInPolygon(p: Point, points: readonly Point[]): boolean {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!
    const b = points[j]!
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside
    }
  }
  return inside
}

const cross = (o: Point, a: Point, b: Point) =>
  (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

/** True when segments ab and cd cross or touch. */
export function segmentsIntersect(a: Point, b: Point, c: Point, d: Point, epsilon = 1e-9): boolean {
  const d1 = cross(c, d, a)
  const d2 = cross(c, d, b)
  const d3 = cross(a, b, c)
  const d4 = cross(a, b, d)
  if (
    ((d1 > epsilon && d2 < -epsilon) || (d1 < -epsilon && d2 > epsilon)) &&
    ((d3 > epsilon && d4 < -epsilon) || (d3 < -epsilon && d4 > epsilon))
  ) {
    return true
  }
  const onSegment = (p: Point, q: Point, r: Point) =>
    Math.min(p.x, q.x) - epsilon <= r.x &&
    r.x <= Math.max(p.x, q.x) + epsilon &&
    Math.min(p.y, q.y) - epsilon <= r.y &&
    r.y <= Math.max(p.y, q.y) + epsilon
  return (
    (Math.abs(d1) <= epsilon && onSegment(c, d, a)) ||
    (Math.abs(d2) <= epsilon && onSegment(c, d, b)) ||
    (Math.abs(d3) <= epsilon && onSegment(a, b, c)) ||
    (Math.abs(d4) <= epsilon && onSegment(a, b, d))
  )
}

/** True when two non-adjacent edges of the closed polygon cross or touch. */
export function isSelfIntersecting(points: readonly Point[]): boolean {
  const n = points.length
  if (n < 4) return false
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const adjacent = j === i + 1 || (i === 0 && j === n - 1)
      if (adjacent) continue
      if (segmentsIntersect(points[i]!, points[(i + 1) % n]!, points[j]!, points[(j + 1) % n]!)) {
        return true
      }
    }
  }
  return false
}

/** Closest point to p on segment ab, with its distance and position t (0 = a, 1 = b). */
export function nearestPointOnSegment(
  p: Point,
  a: Point,
  b: Point,
): { point: Point; t: number; distance: number } {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared))
  const point = { x: a.x + t * dx, y: a.y + t * dy }
  return { point, t, distance: distance(p, point) }
}

/**
 * Direction from a to b in degrees, as on a map: 0° = right, 90° = up, 180° = left, 270° = down
 * (counter-clockwise, even though y points down on screen). Result in [0, 360).
 */
export function angleDeg(a: Point, b: Point): number {
  const degrees = (Math.atan2(-(b.y - a.y), b.x - a.x) * 180) / Math.PI
  return (degrees + 360) % 360 // also turns -0 into 0
}

/** Unit vector for a direction in degrees (same convention as angleDeg). */
export function direction(degrees: number): Point {
  const r = (degrees * Math.PI) / 180
  return { x: Math.cos(r), y: -Math.sin(r) }
}

/** The point `length` metres from `from`, in the given direction. */
export function pointAt(from: Point, degrees: number, length: number): Point {
  const d = direction(degrees)
  return { x: from.x + d.x * length, y: from.y + d.y * length }
}

/** Rounds to a micrometre, so stored coordinates stay clean (12 instead of 11.999999999998). */
export function roundPoint(p: Point): Point {
  const round = (v: number) => Math.round(v * 1e6) / 1e6 || 0
  return { x: round(p.x), y: round(p.y) }
}
