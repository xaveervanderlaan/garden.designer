import type { Point } from '../model/schema'
import { distance } from './polygon'

/**
 * Editing a closed outline (the plot, a bed) corner by corner. Pure functions: they return a new
 * list, or the same list when the change isn't possible.
 */

export const MIN_OUTLINE_CORNERS = 3

export function moveCorner(points: readonly Point[], index: number, to: Point): Point[] {
  return points.map((p, i) => (i === index ? to : p))
}

/** Inserts a corner after `afterIndex` (i.e. on the edge from that corner to the next). */
export function insertCorner(points: readonly Point[], afterIndex: number, at: Point): Point[] {
  const result = [...points]
  result.splice(afterIndex + 1, 0, at)
  return result
}

/** Removes a corner; refused (the same list comes back) below the minimum of 3. */
export function removeCorner(points: readonly Point[], index: number): readonly Point[] {
  if (points.length <= MIN_OUTLINE_CORNERS) return points
  return points.filter((_, i) => i !== index)
}

/**
 * Sets the length of edge `index` (from corner index to the next) by moving the next corner along
 * the edge's direction. The following edge changes accordingly.
 */
export function setEdgeLength(
  points: readonly Point[],
  index: number,
  length: number,
): readonly Point[] {
  const n = points.length
  if (n < 2 || !(length > 0)) return points
  const from = points[index]!
  const nextIndex = (index + 1) % n
  const to = points[nextIndex]!
  const current = distance(from, to)
  if (current === 0) return points
  const factor = length / current
  const moved = { x: from.x + (to.x - from.x) * factor, y: from.y + (to.y - from.y) * factor }
  return moveCorner(points, nextIndex, moved)
}
