import type { Point } from '../../../model/schema'

/** Rough width of a 12 px label such as "12.50 m". */
export const LENGTH_LABEL_WIDTH_PX = 56
const LABEL_HEIGHT_PX = 14
const GAP_PX = 6

/**
 * Where to centre a (horizontal) length label for edge a→b: the midpoint, pushed outward far
 * enough to clear the line — further beside steep edges, where the text's width points outward.
 * `clockwise` is the outline's orientation on screen (positive shoelace area).
 */
export function edgeLabelPosition(
  a: Point,
  b: Point,
  clockwise: boolean,
  textWidth = LENGTH_LABEL_WIDTH_PX,
): Point {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = Math.hypot(dx, dy) || 1
  const nx = (clockwise ? dy : -dy) / length
  const ny = (clockwise ? -dx : dx) / length
  const offset = GAP_PX + (Math.abs(nx) * textWidth) / 2 + (Math.abs(ny) * LABEL_HEIGHT_PX) / 2
  return { x: (a.x + b.x) / 2 + nx * offset, y: (a.y + b.y) / 2 + ny * offset }
}
