import type { Point, Shape } from '../model/schema'
import { distance } from './polygon'
import { type Matrix, applyMatrix, compose, rotation, scaling, translation } from './transform'

/**
 * An object's own frame: the axes it is resized along and rotated by (its "width" and "depth").
 * Nothing is stored for it; it follows from the shape:
 * - a polygon is aligned with its longest edge (a building's main wall), turned by a multiple of
 *   90° into (-45°, 45°] so "width" is the more horizontal side;
 * - a polyline (fence, wall) uses the plan's axes;
 * - a point symbol uses its rotation.
 * Angles here are as Konva has them: degrees, clockwise on screen (y points down).
 */

/** Turns an angle by multiples of 90° into (-45°, 45°]. */
export function quarterTurnAngle(degrees: number): number {
  const a = (((degrees + 45) % 90) + 90) % 90 // [0, 90)
  return a === 0 ? 45 : a - 45 + 0 // -0 → 0
}

/** Angle of the longest edge of a closed outline (degrees, clockwise on screen), or 0. */
export function longestEdgeDeg(points: readonly Point[]): number {
  let best = 0
  let angle = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!
    const b = points[(i + 1) % points.length]!
    const length = distance(a, b)
    if (length > best + 1e-9) {
      best = length
      angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
    }
  }
  return angle
}

/** The frame's angle (clockwise on screen, degrees). */
export function shapeFrameDeg(shape: Shape): number {
  switch (shape.type) {
    case 'polygon':
      return roundAngle(quarterTurnAngle(longestEdgeDeg(shape.points)))
    case 'polyline':
      return 0
    case 'point':
      return shape.rotationDeg
  }
}

/** Angles a hair off a round value (from floating-point sums) are rounded to 1e-9°. */
function roundAngle(degrees: number): number {
  return Math.round(degrees * 1e9) / 1e9 + 0
}

export type FrameBox = {
  /** Angle of the frame (clockwise on screen). */
  angleDeg: number
  /** Centre of the box, in world coordinates. */
  centre: Point
  /** Size along the frame's x axis (width) and y axis (depth). */
  width: number
  depth: number
}

/** The smallest box in the given frame that holds the points. */
export function frameBox(points: readonly Point[], angleDeg: number): FrameBox {
  const toLocal = rotation(-angleDeg)
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    const q = applyMatrix(toLocal, p)
    minX = Math.min(minX, q.x)
    minY = Math.min(minY, q.y)
    maxX = Math.max(maxX, q.x)
    maxY = Math.max(maxY, q.y)
  }
  const centre = applyMatrix(rotation(angleDeg), { x: (minX + maxX) / 2, y: (minY + maxY) / 2 })
  return { angleDeg, centre, width: maxX - minX, depth: maxY - minY }
}

/** Scaling by (sx, sy) along the axes of a frame at `angleDeg`, about `centre`. */
export function frameScaling(angleDeg: number, centre: Point, sx: number, sy: number): Matrix {
  let m = translation(-centre.x, -centre.y)
  m = compose(rotation(-angleDeg), m)
  m = compose(scaling(sx, sy), m)
  m = compose(rotation(angleDeg), m)
  return compose(translation(centre.x, centre.y), m)
}

/** The points an object is resized by: its outline or line (a point symbol has none). */
export function shapePoints(shape: Shape): readonly Point[] {
  return shape.type === 'point' ? [shape.position] : shape.points
}

/** The box of a shape in its own frame (a point symbol: zero size at its position). */
export function shapeFrameBox(shape: Shape): FrameBox {
  return frameBox(shapePoints(shape), shapeFrameDeg(shape))
}

/** An axis-aligned rectangle with corners a and b, clockwise from the top-left corner. */
export function rectangleFromCorners(a: Point, b: Point): Point[] {
  const minX = Math.min(a.x, b.x)
  const maxX = Math.max(a.x, b.x)
  const minY = Math.min(a.y, b.y)
  const maxY = Math.max(a.y, b.y)
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ]
}

/** A width × depth rectangle centred on `centre`, axis-aligned. */
export function rectangleAround(centre: Point, width: number, depth: number): Point[] {
  return rectangleFromCorners(
    { x: centre.x - width / 2, y: centre.y - depth / 2 },
    { x: centre.x + width / 2, y: centre.y + depth / 2 },
  )
}
