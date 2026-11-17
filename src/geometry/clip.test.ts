import { describe, expect, it } from 'vitest'
import type { Point } from '../model/schema'
import { areaWithin, differenceArea } from './clip'

const rect = (x: number, y: number, w: number, h: number): Point[] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
]

describe('differenceArea', () => {
  it('subtracts overlapping polygons once', () => {
    // 10 x 10 minus two overlapping 4 x 4 squares: 100 - (16 + 16 - 4 overlap) = 72
    const area = differenceArea(rect(0, 0, 10, 10), [rect(1, 1, 4, 4), rect(3, 3, 4, 4)])
    expect(area).toBeCloseTo(72)
    // a clip hanging over the edge only removes what lies inside
    expect(differenceArea(rect(0, 0, 10, 10), [rect(8, 8, 4, 4)])).toBeCloseTo(96)
  })

  it('ignores polygons that do not touch', () => {
    expect(differenceArea(rect(0, 0, 10, 10), [rect(20, 0, 4, 4), rect(10, 0, 4, 4)])).toBe(100)
    expect(differenceArea(rect(0, 0, 10, 10), [])).toBe(100)
  })
})

describe('areaWithin', () => {
  it('subtracts clips and limits to the outline', () => {
    // 10 x 10 subject, plot covers x 0..5: 50, minus a 2 x 2 clip inside it = 46
    expect(areaWithin(rect(0, 0, 10, 10), rect(0, 0, 5, 10), [rect(1, 1, 2, 2)])).toBeCloseTo(46)
    expect(areaWithin(rect(0, 0, 10, 10), null, [rect(1, 1, 2, 2)])).toBeCloseTo(96)
    expect(areaWithin(rect(0, 0, 10, 10), rect(20, 20, 5, 5), [])).toBeCloseTo(0)
    expect(areaWithin(rect(0, 0, 10, 10), null, [])).toBe(100)
  })
})
