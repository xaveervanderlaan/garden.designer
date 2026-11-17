import { describe, expect, it } from 'vitest'
import { coarseSunMap } from './sunGrid'

describe('coarseSunMap', () => {
  it('takes the majority class per cell', () => {
    // 4 × 2 cells of 1 m → 2 × 1 cells of 2 m. Left: 3 full sun + 1 shade; right: 1 part shade
    // (the rest outside the mask).
    const hours = Float32Array.from([8, 8, 2, NaN, 8, 1, NaN, NaN])
    const map = coarseSunMap(
      { grid: { originX: 1, originY: 2, cellM: 1, cols: 4, rows: 2 }, hours },
      { fullSunHours: 6, partShadeHours: 3 },
    )
    expect(map).toEqual({ originX: 1, originY: 2, cellM: 2, rows: ['FS'] })
    const outside = Float32Array.from([NaN, NaN, 4, 4, NaN, NaN, 4, 1])
    const second = coarseSunMap(
      { grid: { originX: 0, originY: 0, cellM: 1, cols: 4, rows: 2 }, hours: outside },
      { fullSunHours: 6, partShadeHours: 3 },
    )
    expect(second.rows).toEqual(['.P'])
  })
})
