import { describe, expect, it } from 'vitest'
import {
  MIN_MAJOR_SPACING_PX,
  MIN_MINOR_SPACING_PX,
  gridLinePositions,
  gridSteps,
  scaleBarLength,
} from './grid'

describe('gridSteps', () => {
  it.each([2, 5, 17, 37.8, 100, 400, 1000])(
    'at %s px/m: readable spacing, majors are multiples of minors',
    (scale) => {
      const { minor, major } = gridSteps(scale)
      expect(minor * scale).toBeGreaterThanOrEqual(MIN_MINOR_SPACING_PX)
      expect(major * scale).toBeGreaterThanOrEqual(MIN_MAJOR_SPACING_PX)
      expect(major).toBeGreaterThan(minor)
      expect(Math.abs(major / minor - Math.round(major / minor))).toBeLessThan(1e-9)
    },
  )

  it('uses the finest readable minor spacing', () => {
    expect(gridSteps(40).minor).toBe(0.5) // 0.5 m = 20 px; 0.2 m = 8 px is too dense
    expect(gridSteps(40).major).toBe(2) // 2 m = 80 px
  })

  it('gets finer when zooming in', () => {
    expect(gridSteps(400).minor).toBeLessThan(gridSteps(40).minor)
  })
})

describe('gridLinePositions', () => {
  it('lists every multiple of the step in the range', () => {
    expect(gridLinePositions(-1.2, 3.1, 1)).toEqual([-1, 0, 1, 2, 3])
    expect(gridLinePositions(0, 1, 0.5)).toEqual([0, 0.5, 1])
  })

  it('stops at the limit', () => {
    expect(gridLinePositions(0, 1e6, 1, 10)).toHaveLength(10)
  })
})

describe('scaleBarLength', () => {
  it('picks the longest nice length that fits', () => {
    expect(scaleBarLength(40, 120)).toBe(2) // 2 m = 80 px; 5 m = 200 px is too long
    expect(scaleBarLength(400, 120)).toBe(0.2)
    expect(scaleBarLength(2, 120)).toBe(50)
  })
})
