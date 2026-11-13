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
