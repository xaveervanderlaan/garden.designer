import type { Point } from '../model/schema'
import { angleDeg, direction, distance, nearestPointOnSegment } from './polygon'

/**
 * Snapping while drawing or dragging corners. Tolerances are in screen pixels, so snapping feels
 * the same at every zoom level. Priority: existing corner > angle (relative to the previous
 * corner) > existing edge > grid.
 */
export const SNAP_TOLERANCE_PX = 10
export const ANGLE_STEP_DEG = 15
/** Right angles snap from further away than other 15° steps. */
export const RIGHT_ANGLE_TOLERANCE_FACTOR = 1.6

export type SnapKind = 'vertex' | 'angle' | 'edge' | 'grid'

export type Snap = {
  point: Point
  /** What was snapped to, or null when nothing was (or snapping is off). */
  kind: SnapKind | null
  /** For angle snaps: the snapped direction in degrees. */
  angle?: number
}

export type SnapContext = {
  /** Existing corners to snap to. */
  vertices: readonly Point[]
  /** Existing edges to snap to. */
  edges: ReadonlyArray<readonly [Point, Point]>
  gridSize: number
  /**
   * false: no snapping to the grid, and lengths along a snapped angle aren't rounded to it (for
   * tracing over the site plan). Default true.
   */
  snapToGrid?: boolean
  /** Pixels per metre, to convert the tolerance. */
  scale: number
  /** The previous corner while drawing: enables angle snapping. */
  anchor?: Point
}

export function snapPoint(raw: Point, ctx: SnapContext): Snap {
  const tolerance = SNAP_TOLERANCE_PX / ctx.scale
  const gridOn = ctx.snapToGrid ?? true

  // 1. Existing corners.
  let nearestVertex: Point | undefined
  let nearestDistance = tolerance
  for (const vertex of ctx.vertices) {
    const d = distance(raw, vertex)
    if (d <= nearestDistance) {
      nearestDistance = d
      nearestVertex = vertex
    }
  }
  if (nearestVertex) return { point: nearestVertex, kind: 'vertex' }

  // 2. Angles from the previous corner, with the length rounded to the grid (if on). Right angles
  //    are tried first, with a wider tolerance; then the nearest 15° step.
  if (ctx.anchor) {
    const anchor = ctx.anchor
    const length = distance(anchor, raw)
    if (length > tolerance) {
      const angle = angleDeg(anchor, raw)
      const candidates = [
        { step: 90, limit: tolerance * RIGHT_ANGLE_TOLERANCE_FACTOR },
        { step: ANGLE_STEP_DEG, limit: tolerance },
      ]
      for (const { step, limit } of candidates) {
        const snapped = (Math.round(angle / step) * step) % 360
        const offAngle = (((angle - snapped + 540) % 360) - 180) * (Math.PI / 180)
        if (Math.abs(length * Math.sin(offAngle)) > limit) continue
        const along = length * Math.cos(offAngle)
        const rounded = gridOn ? Math.round(along / ctx.gridSize) * ctx.gridSize : along
        const snappedLength = rounded > 0 ? rounded : along
        const d = direction(snapped)
        return {
          point: { x: anchor.x + d.x * snappedLength, y: anchor.y + d.y * snappedLength },
          kind: 'angle',
          angle: snapped,
        }
      }
    }
  }

  // 3. Existing edges.
  let nearestEdgePoint: Point | undefined
  let nearestEdgeDistance = tolerance
  for (const [a, b] of ctx.edges) {
    const candidate = nearestPointOnSegment(raw, a, b)
    if (candidate.distance <= nearestEdgeDistance) {
      nearestEdgeDistance = candidate.distance
      nearestEdgePoint = candidate.point
    }
  }
  if (nearestEdgePoint) return { point: nearestEdgePoint, kind: 'edge' }

  // 4. The grid.
  if (!gridOn) return { point: raw, kind: null }
  const g = ctx.gridSize
  return { point: { x: Math.round(raw.x / g) * g, y: Math.round(raw.y / g) * g }, kind: 'grid' }
}

/** Edges of a polygon (closed) or polyline (open) as point pairs. */
export function edgesOf(points: readonly Point[], closed: boolean): Array<[Point, Point]> {
  const edges: Array<[Point, Point]> = []
  const count = closed ? points.length : points.length - 1
  for (let i = 0; i < count; i++) edges.push([points[i]!, points[(i + 1) % points.length]!])
  return edges
}
