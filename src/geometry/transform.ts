import type { Point } from '../model/schema'

/** 2D affine transform [a, b, c, d, e, f]: x' = a·x + c·y + e, y' = b·x + d·y + f (Konva/canvas order). */
export type Matrix = readonly [number, number, number, number, number, number]

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]

export function applyMatrix(m: Matrix, p: Point): Point {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] }
}

export function translation(dx: number, dy: number): Matrix {
  return [1, 0, 0, 1, dx, dy]
}

/** Rotation in degrees about `centre`. */
export function rotation(degrees: number, centre: Point = { x: 0, y: 0 }): Matrix {
  const r = (degrees * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  return [
    cos,
    sin,
    -sin,
    cos,
    centre.x - cos * centre.x + sin * centre.y,
    centre.y - sin * centre.x - cos * centre.y,
  ]
}

/** The rotation part of a matrix, in degrees. */
export function rotationOf(m: Matrix): number {
  return (Math.atan2(m[1], m[0]) * 180) / Math.PI
}

/** Normalises an angle to [0, 360) (never -0). */
export function normaliseDegrees(degrees: number): number {
  const d = degrees % 360
  return d < 0 ? d + 360 : d + 0
}

/** The transform that applies `second` after `first` (second · first). */
export function compose(second: Matrix, first: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = second
  const [a2, b2, c2, d2, e2, f2] = first
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ]
}

/** Scaling by (sx, sy) about the origin. */
export function scaling(sx: number, sy: number): Matrix {
  return [sx, 0, 0, sy, 0, 0]
}
