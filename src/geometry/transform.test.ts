import { describe, expect, it } from 'vitest'
import {
  IDENTITY,
  applyMatrix,
  normaliseDegrees,
  rotation,
  rotationOf,
  translation,
} from './transform'

const close = (p: { x: number; y: number }, x: number, y: number) => {
  expect(p.x).toBeCloseTo(x)
  expect(p.y).toBeCloseTo(y)
}

describe('transform', () => {
  it('applies identity and translation', () => {
    expect(applyMatrix(IDENTITY, { x: 3, y: 4 })).toEqual({ x: 3, y: 4 })
    expect(applyMatrix(translation(1, -2), { x: 3, y: 4 })).toEqual({ x: 4, y: 2 })
  })

  it('rotates about a centre (y points down, so +90° turns east into south)', () => {
    close(applyMatrix(rotation(90), { x: 1, y: 0 }), 0, 1)
    close(applyMatrix(rotation(90, { x: 5, y: 5 }), { x: 6, y: 5 }), 5, 6)
    close(applyMatrix(rotation(180, { x: 5, y: 5 }), { x: 5, y: 5 }), 5, 5)
  })

  it('reads the rotation angle back', () => {
    expect(rotationOf(rotation(30))).toBeCloseTo(30)
    expect(rotationOf(rotation(-120, { x: 3, y: 1 }))).toBeCloseTo(-120)
  })

  it('normalises angles to [0, 360)', () => {
    expect(normaliseDegrees(370)).toBe(10)
    expect(normaliseDegrees(-90)).toBe(270)
    expect(normaliseDegrees(360)).toBe(0)
  })
})
