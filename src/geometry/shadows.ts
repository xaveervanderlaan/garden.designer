import polygonClipping, {
  type MultiPolygon,
  type Pair,
  type Polygon,
  type Ring,
} from 'polygon-clipping'
import type { Point } from '../model/schema'
import type { Bounds } from './bounds'
import { shadowStep, type SunPosition } from './sun'

/**
 * Shadow geometry (SPEC §4.5): pure functions, independent of the app's object types (see
 * projectCasters.ts for turning a design into casters).
 *
 * Conventions:
 * - Plan coordinates: metres, x right, y down. Heights in metres above flat ground.
 * - Polygons use polygon-clipping's format: a `Ring` is a list of `[x, y]` pairs, open (the first
 *   point isn't repeated at the end); a `Polygon` is `[outer ring, ...holes]`; a `MultiPolygon` is
 *   a list of polygons. Input ring orientation doesn't matter. Merged output follows
 *   polygon-clipping: outer rings counter-clockwise in maths terms (positive shoelace area, which
 *   looks clockwise on screen), holes the other way, so both even-odd and non-zero fills work.
 * - The sun enters as a `shadowStep` (sun.ts): the plan vector by which the shadow of a point 1 m
 *   up is displaced. A point at height z casts its shadow at `foot + z × step`.
 * - When the sun is down there are no shadows at all (empty results): the whole plan is unlit,
 *   which callers handle themselves (the sun-hours map counts such moments as no sun).
 */

export type { MultiPolygon, Pair, Polygon, Ring }

/**
 * A solid with vertical sides: a building, wall, fence or hedge band. It fills `footprint` from
 * `baseM` (default 0: standing on the ground; higher for a roof on posts) up to `heightM`.
 */
export type PrismCaster = {
  kind: 'prism'
  footprint: MultiPolygon
  heightM: number
  baseM?: number
  /** Id of the object it stands for (not used here; handy for callers). */
  sourceId?: string
}

/** A vertical cylinder: a tree or shrub canopy (solid, SPEC §4.5), or a post. */
export type CanopyCaster = {
  kind: 'canopy'
  centre: Point
  radiusM: number
  baseM: number
  topM: number
  sourceId?: string
}

export type Caster = PrismCaster | CanopyCaster

/**
 * Part of a shadow; a shadow is the union of its pieces. A `polygon` piece is filled even-odd
 * (holes are rings inside the outer ring); a `capsule` is every point within `radiusM` of the
 * segment a–b. Pieces may overlap. `bounds` is their bounding box, for quick rejection.
 */
export type ShadowPiece =
  | { kind: 'polygon'; rings: Ring[]; bounds: Bounds }
  | { kind: 'capsule'; a: Point; b: Point; radiusM: number; bounds: Bounds }

/** Corners used for circles when shadows are turned into polygons (drawing, polyline buffers). */
export const CIRCLE_SEGMENTS = 32

/** Trees cast shadows from their canopy only: it starts at about this fraction of their height. */
export const TREE_CANOPY_BASE_FRACTION = 1 / 3

// --- Casters --------------------------------------------------------------------------------

/** A prism on a polygon footprint (the app's `{ x, y }` points). */
export function prismFromPolygon(
  points: readonly Point[],
  heightM: number,
  baseM = 0,
): PrismCaster {
  return { kind: 'prism', footprint: [[points.map((p): Pair => [p.x, p.y])]], heightM, baseM }
}

/** A prism on the footprint of a thick polyline (a wall, fence or hedge); see polylineFootprint. */
export function prismFromPolyline(
  points: readonly Point[],
  thicknessM: number,
  heightM: number,
  baseM = 0,
): PrismCaster {
  return { kind: 'prism', footprint: polylineFootprint(points, thicknessM), heightM, baseM }
}

/** A tree: a solid canopy cylinder (radius = spread / 2) from `baseFraction` of its height up. */
export function treeCaster(
  centre: Point,
  spreadM: number,
  heightM: number,
  baseFraction = TREE_CANOPY_BASE_FRACTION,
): CanopyCaster {
  return {
    kind: 'canopy',
    centre,
    radiusM: spreadM / 2,
    baseM: heightM * baseFraction,
    topM: heightM,
  }
}

/**
 * The footprint of a polyline drawn `thicknessM` wide, with round ends and round joins (as the
 * plan draws walls, fences and hedges): the union of a capsule around each segment. Polylines
 * that end where they start (a fence around a yard) come out as a polygon with a hole.
 */
export function polylineFootprint(
  points: readonly Point[],
  thicknessM: number,
  segments = 16,
): MultiPolygon {
  if (points.length === 0 || !(thicknessM > 0)) return []
  const radius = thicknessM / 2
  const parts: Polygon[] = []
  for (let i = 0; i + 1 < points.length; i++) {
    parts.push([capsuleRing(points[i]!, points[i + 1]!, radius, segments)])
  }
  if (parts.length === 0) parts.push([capsuleRing(points[0]!, points[0]!, radius, segments)])
  return union(parts)
}

// --- Shadows ----------------------------------------------------------------------------------

/**
 * The pieces whose union is the shadow of the casters, for a shadow step (see sun.ts). Cheap: no
 * polygon clipping, so the sun-hours map can call it for every sample.
 *
 * A prism's shadow is the footprint swept from its base offset (base × step) to its top offset
 * (height × step): the footprint at both offsets plus, for every edge facing away from the sun,
 * the quadrilateral that edge sweeps. That holds for concave footprints and holes too. A convex
 * footprint gives a single piece: the convex hull of the two offset copies. A canopy cylinder's
 * shadow is a capsule: its disc swept from the base offset to the top offset.
 */
export function shadowPieces(casters: readonly Caster[], step: Point): ShadowPiece[] {
  const pieces: ShadowPiece[] = []
  for (const caster of casters) {
    if (caster.kind === 'canopy') {
      if (!(caster.topM > caster.baseM) || !(caster.radiusM > 0)) continue
      const { centre, radiusM } = caster
      const a = { x: centre.x + step.x * caster.baseM, y: centre.y + step.y * caster.baseM }
      const b = { x: centre.x + step.x * caster.topM, y: centre.y + step.y * caster.topM }
      const bounds = {
        minX: Math.min(a.x, b.x) - radiusM,
        minY: Math.min(a.y, b.y) - radiusM,
        maxX: Math.max(a.x, b.x) + radiusM,
        maxY: Math.max(a.y, b.y) + radiusM,
      }
      pieces.push({ kind: 'capsule', a, b, radiusM, bounds })
    } else {
      prismPieces(caster, step, pieces)
    }
  }
  return pieces
}

function prismPieces(caster: PrismCaster, step: Point, pieces: ShadowPiece[]) {
  const base = caster.baseM ?? 0
  if (!(caster.heightM > base)) return
  const d0: Pair = [step.x * base, step.y * base]
  const d1: Pair = [step.x * caster.heightM, step.y * caster.heightM]
  // The direction the footprint is swept in, from its base offset to its top offset.
  const sweepX = d1[0] - d0[0]
  const sweepY = d1[1] - d0[1]

  for (const polygon of caster.footprint) {
    const [outerRing, ...holeRings] = polygon
    const outer = outerRing && openRing(outerRing)
    if (!outer || outer.length < 3) continue
    const rings = [outer, ...holeRings.map(openRing).filter((ring) => ring.length >= 3)]

    if (rings.length === 1 && isConvex(outer)) {
      addPolygonPiece(pieces, [convexHull([...shift(outer, d0), ...shift(outer, d1)])])
      continue
    }
    addPolygonPiece(
      pieces,
      rings.map((ring) => shift(ring, d0)),
    )
    addPolygonPiece(
      pieces,
      rings.map((ring) => shift(ring, d1)),
    )
    rings.forEach((ring, index) => {
      // Outward normal of edge e is s × (e.y, −e.x), where s depends on the ring's orientation
      // (positive shoelace area: interior on the left) and on whether the ring is a hole.
      const s = Math.sign(shoelace(ring)) * (index === 0 ? 1 : -1)
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!
        const b = ring[(i + 1) % ring.length]!
        const ex = b[0] - a[0]
        const ey = b[1] - a[1]
        // Only edges facing away from the sun bound the swept area.
        if (s * (ey * sweepX - ex * sweepY) <= 1e-12) continue
        const quad: Ring = [
          [a[0] + d0[0], a[1] + d0[1]],
          [b[0] + d0[0], b[1] + d0[1]],
          [b[0] + d1[0], b[1] + d1[1]],
          [a[0] + d1[0], a[1] + d1[1]],
        ]
        addPolygonPiece(pieces, [quad])
      }
    })
  }
}

function addPolygonPiece(pieces: ShadowPiece[], rings: Ring[]) {
  const outer = rings[0]
  if (!outer || outer.length < 3 || Math.abs(shoelace(outer)) < 1e-12) return
  pieces.push({ kind: 'polygon', rings, bounds: ringBounds(outer) })
}

/** True when the point lies in one of the pieces (in the shadow). */
export function pointInPieces(pieces: readonly ShadowPiece[], p: Point): boolean {
  for (const piece of pieces) {
    const { bounds } = piece
    if (p.x < bounds.minX || p.x > bounds.maxX || p.y < bounds.minY || p.y > bounds.maxY) continue
    if (piece.kind === 'capsule') {
      if (distanceToSegmentSquared(p.x, p.y, piece.a, piece.b) <= piece.radiusM ** 2) return true
    } else {
      let inside = false
      for (const ring of piece.rings) if (pointInRing(p.x, p.y, ring)) inside = !inside
      if (inside) return true
    }
  }
  return false
}

/** The pieces merged into one (multi)polygon, for drawing. Circles get `segments` corners. */
export function mergePieces(pieces: readonly ShadowPiece[], segments = CIRCLE_SEGMENTS) {
  return union(
    pieces.map((piece): Polygon =>
      piece.kind === 'capsule'
        ? [capsuleRing(piece.a, piece.b, piece.radiusM, segments)]
        : piece.rings,
    ),
  )
}

/** The merged shadow of the casters for a shadow step. */
export function castShadows(casters: readonly Caster[], step: Point, segments = CIRCLE_SEGMENTS) {
  return mergePieces(shadowPieces(casters, step), segments)
}

/** The merged shadow at a sun position; empty when the sun is down. */
export function shadowAt(
  casters: readonly Caster[],
  sun: SunPosition,
  northAngleDeg: number,
  segments = CIRCLE_SEGMENTS,
): MultiPolygon {
  const step = shadowStep(sun, northAngleDeg)
  return step ? castShadows(casters, step, segments) : []
}

/** SVG path data for a (multi)polygon (e.g. for a Konva `Path`); every ring is closed with Z. */
export function toSvgPath(shape: MultiPolygon): string {
  const round = (v: number) => Math.round(v * 1000) / 1000
  return shape
    .flatMap((polygon) => polygon)
    .filter((ring) => ring.length > 0)
    .map((ring) => `M${ring.map(([x, y]) => `${round(x)} ${round(y)}`).join('L')}Z`)
    .join('')
}

/** Total area of a (multi)polygon in m² (holes subtracted). */
export function multiPolygonArea(shape: MultiPolygon): number {
  let area = 0
  for (const polygon of shape) {
    polygon.forEach((ring, index) => {
      area += ((index === 0 ? 1 : -1) * Math.abs(shoelace(ring))) / 2
    })
  }
  return area
}

// --- Helpers ----------------------------------------------------------------------------------

/**
 * Union through polygon-clipping, with rings returned open. polygon-clipping can (rarely) fail on
 * nearly coincident edges; then the parts are merged one by one and a part that still fails is
 * added unmerged, so a shadow is never lost.
 */
function union(parts: Polygon[]): MultiPolygon {
  const valid = parts.filter((polygon) => polygon.length > 0 && polygon[0]!.length >= 3)
  if (valid.length === 0) return []
  let merged: MultiPolygon
  try {
    merged = polygonClipping.union(valid[0]!, ...valid.slice(1))
  } catch {
    merged = []
    for (const part of valid) {
      try {
        merged =
          merged.length === 0 ? polygonClipping.union(part) : polygonClipping.union(merged, part)
      } catch {
        merged = [...merged, part]
      }
    }
  }
  return merged.map((polygon) => polygon.map(openRing))
}

/** Drops a repeated closing point and consecutive duplicates. */
function openRing(ring: Ring): Ring {
  const result: Ring = []
  for (const point of ring) {
    const last = result[result.length - 1]
    if (!last || last[0] !== point[0] || last[1] !== point[1]) result.push(point)
  }
  const first = result[0]
  const last = result[result.length - 1]
  if (result.length > 1 && first && last && first[0] === last[0] && first[1] === last[1]) {
    result.pop()
  }
  return result
}

function shift(ring: Ring, [dx, dy]: Pair): Ring {
  return ring.map(([x, y]): Pair => [x + dx, y + dy])
}

/** Twice the signed area: positive when the ring runs counter-clockwise in maths terms. */
function shoelace(ring: Ring): number {
  let sum = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += ring[j]![0] * ring[i]![1] - ring[i]![0] * ring[j]![1]
  }
  return sum
}

/** Convex (and simple): its area equals that of its convex hull. */
function isConvex(ring: Ring): boolean {
  const area = Math.abs(shoelace(ring))
  const hullArea = Math.abs(shoelace(convexHull(ring)))
  return Math.abs(hullArea - area) <= 1e-9 * Math.max(1, hullArea)
}

/** Andrew's monotone chain; counter-clockwise in maths terms, without collinear points. */
function convexHull(points: readonly Pair[]): Ring {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (sorted.length < 3) return sorted
  const cross = (o: Pair, a: Pair, b: Pair) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: Pair[] = []
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) {
      lower.pop()
    }
    lower.push(p)
  }
  const upper: Pair[] = []
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]!
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) {
      upper.pop()
    }
    upper.push(p)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

/**
 * A capsule (every point within `radius` of segment a–b) as a convex ring: the hull of two
 * circles with `segments` corners each, turned so the long sides lie exactly `radius` out.
 */
function capsuleRing(a: Point, b: Point, radius: number, segments: number): Ring {
  const start = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2
  const count = Math.max(4, Math.round(segments / 2) * 2)
  const points: Pair[] = []
  for (const c of a.x === b.x && a.y === b.y ? [a] : [a, b]) {
    for (let k = 0; k < count; k++) {
      const angle = start + (2 * Math.PI * k) / count
      points.push([c.x + radius * Math.cos(angle), c.y + radius * Math.sin(angle)])
    }
  }
  return convexHull(points)
}

function ringBounds(ring: Ring): Bounds {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of ring) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return { minX, minY, maxX, maxY }
}

/** Even-odd ray casting, the same rule as pointInPolygon in polygon.ts. */
export function pointInRing(x: number, y: number, ring: Ring): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[i]!
    const [bx, by] = ring[j]!
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside
  }
  return inside
}

export function distanceToSegmentSquared(x: number, y: number, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  let t = lengthSquared === 0 ? 0 : ((x - a.x) * dx + (y - a.y) * dy) / lengthSquared
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const px = a.x + t * dx - x
  const py = a.y + t * dy - y
  return px * px + py * py
}
