import type { Point } from '../model/schema'
import { distance } from './polygon'
import { type Viewport, clampScale, screenToWorld } from './viewport'

/** A pointer that moved at most this far (screen px) between down and up can still be a tap. */
export const TAP_SLOP_PX = 10
/** A press longer than this (ms) is not a tap. */
export const TAP_MAX_MS = 500
/** A tap hits an item this close to it (screen px). */
export const TAP_TOLERANCE_PX = 12

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/**
 * The viewport after two fingers moved from `from` to `to`: zoomed by the change in their
 * distance, and panned so the world point under their first midpoint lies under the new one.
 */
export function pinchViewport(
  start: Viewport,
  from: readonly [Point, Point],
  to: readonly [Point, Point],
): Viewport {
  const before = distance(from[0], from[1])
  const after = distance(to[0], to[1])
  const scale = before > 0 ? clampScale((start.scale * after) / before) : start.scale
  const anchor = screenToWorld(midpoint(from[0], from[1]), start)
  const centre = midpoint(to[0], to[1])
  return { scale, x: centre.x - anchor.x * scale, y: centre.y - anchor.y * scale }
}

type Press = { at: Point; time: number }

export function isTap(down: Press, up: Press): boolean {
  return distance(down.at, up.at) <= TAP_SLOP_PX && up.time - down.time <= TAP_MAX_MS
}
