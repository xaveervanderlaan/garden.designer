import { describe, expect, it } from 'vitest'
import { SUN_LEVELS, type Point } from '../model/schema'
import { pointInPolygon } from './polygon'
import { type Caster, prismFromPolygon, prismFromPolyline, treeCaster } from './shadows'
import { sunDirectionOnPlan, sunPosition, sunTimes } from './sun'
import {
  cellCentre,
  cellIndexAt,
  classifyGrid,
  classifySunHours,
  computeSunHours,
  computeSunHoursAsync,
  daySamples,
  daysOf,
  dominantSunLevel,
  forEachCellIn,
  gridForBounds,
  NO_SUN_LEVEL,
  SUN_LEVEL_ORDER,
  type SunGrid,
  type SunHoursInput,
  sunLevelShares,
  sunMismatch,
} from './sunHours'

const AMSTERDAM = { lat: 52.37, lng: 4.9 }
const JUNE_21 = { kind: 'date', date: { year: 2026, month: 6, day: 21 } } as const
const DEC_21 = { kind: 'date', date: { year: 2026, month: 12, day: 21 } } as const

const rect = (x: number, y: number, w: number, h: number): Point[] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
]

function input(overrides: Partial<SunHoursInput>): SunHoursInput {
  return {
    casters: [],
    grid: gridForBounds({ minX: -5, minY: -5, maxX: 5, maxY: 5 }, 1),
    location: AMSTERDAM,
    northAngleDeg: 0,
    days: JUNE_21,
    ...overrides,
  }
}

const hoursAt = (result: ReturnType<typeof computeSunHours>, p: Point) =>
  result.hours[cellIndexAt(result.grid, p)]!

/** A 40 × 25 m (1000 m²) plot with a house, a shed, fences, a wall, a hedge and trees. */
function sampleGarden(): { outline: Point[]; casters: Caster[] } {
  const outline = rect(0, 0, 40, 25)
  const casters: Caster[] = [
    prismFromPolygon(rect(5, -9, 12, 9), 7), // the house, just north of the plot
    prismFromPolygon(
      [
        { x: 30, y: 2 },
        { x: 36, y: 2 },
        { x: 36, y: 6 },
        { x: 33, y: 6 },
        { x: 33, y: 4 },
        { x: 30, y: 4 },
      ],
      2.5,
    ), // an L-shaped shed
    prismFromPolyline(
      [
        { x: 0, y: 0 },
        { x: 0, y: 25 },
        { x: 40, y: 25 },
      ],
      0.1,
      1.8,
    ), // fence west and south
    prismFromPolyline(
      [
        { x: 40, y: 25 },
        { x: 40, y: 0 },
      ],
      0.25,
      2.2,
    ), // wall east
    prismFromPolyline(
      [
        { x: 20, y: 10 },
        { x: 28, y: 10 },
        { x: 28, y: 16 },
      ],
      0.8,
      1.6,
    ), // a hedge
    treeCaster({ x: 8, y: 18 }, 8, 12),
    treeCaster({ x: 34, y: 16 }, 6, 9),
    treeCaster({ x: 15, y: 30 }, 10, 18), // the neighbour's tree, south of the plot
    prismFromPolygon(rect(10, 12, 2, 3), 1.2), // a compost bin
    prismFromPolygon(rect(-12, 3, 8, 10), 6), // the neighbour's house to the west
  ]
  return { outline, casters }
}

describe('grid', () => {
  it('covers the bounds with square cells', () => {
    const grid = gridForBounds({ minX: 0, minY: 0, maxX: 40, maxY: 25 })
    expect(grid).toEqual({ originX: 0, originY: 0, cellM: 0.5, cols: 80, rows: 50 })
    expect(cellCentre(grid, 0, 0)).toEqual({ x: 0.25, y: 0.25 })
    expect(cellIndexAt(grid, { x: 1.1, y: 0.6 })).toBe(80 + 2)
    expect(cellIndexAt(grid, { x: -0.1, y: 1 })).toBe(-1)
  })

  it('makes cells bigger rather than exceed the maximum', () => {
    const grid = gridForBounds({ minX: 0, minY: 0, maxX: 1000, maxY: 1000 }, 0.5, 10_000)
    expect(grid.cols * grid.rows).toBeLessThanOrEqual(10_000)
    expect(grid.cellM).toBeCloseTo(10, 6)
  })

  it('finds the same cells as testing every cell centre', () => {
    const grid: SunGrid = { originX: -1, originY: -2, cellM: 0.37, cols: 60, rows: 50 }
    const star = Array.from({ length: 9 }, (_, k): [number, number] => {
      const angle = (2 * Math.PI * k) / 9
      const r = k % 2 ? 3 : 8
      return [10 + r * Math.cos(angle), 7 + r * Math.sin(angle)]
    })
    const hole: [number, number][] = [
      [9, 6],
      [11, 6],
      [11, 8],
      [9, 8],
    ]
    const found = new Set<number>()
    forEachCellIn(
      { kind: 'polygon', rings: [star, hole], bounds: { minX: 2, minY: -1, maxX: 18, maxY: 15 } },
      grid,
      (index) => found.add(index),
    )
    const points = (ring: [number, number][]) => ring.map(([x, y]) => ({ x, y }))
    for (let row = 0; row < grid.rows; row++) {
      for (let col = 0; col < grid.cols; col++) {
        const c = cellCentre(grid, col, row)
        const inside = pointInPolygon(c, points(star)) !== pointInPolygon(c, points(hole))
        expect(found.has(row * grid.cols + col), `${col},${row}`).toBe(inside)
      }
    }
  })
})

describe('days and samples', () => {
  it('uses the 15th of April to September for the growing season', () => {
    expect(daysOf({ kind: 'season', year: 2026 }).map((d) => `${d.month}/${d.day}`)).toEqual([
      '4/15',
      '5/15',
      '6/15',
      '7/15',
      '8/15',
      '9/15',
    ])
  })

  it('samples the middle of every quarter of an hour from sunrise to sunset', () => {
    const samples = daySamples(JUNE_21.date, AMSTERDAM)
    const times = sunTimes(JUNE_21.date, AMSTERDAM)
    const dayLength = (times.sunset!.getTime() - times.sunrise!.getTime()) / 3_600_000
    expect(samples).toHaveLength(Math.ceil(dayLength * 4))
    expect(samples[0]!.time).toBe(times.sunrise!.getTime() + 7.5 * 60_000)
    expect(samples.reduce((sum, s) => sum + s.hours, 0)).toBeCloseTo(dayLength, 9)
    expect(daySamples(DEC_21.date, { lat: 78.2, lng: 15.6 })).toEqual([]) // polar night
    expect(daySamples(JUNE_21.date, { lat: 78.2, lng: 15.6 })).toHaveLength(96) // polar day
  })
})

describe('sun hours', () => {
  it('gives open ground the full day length', () => {
    const result = computeSunHours(input({}))
    const times = sunTimes(JUNE_21.date, AMSTERDAM)
    const dayLength = (times.sunset!.getTime() - times.sunrise!.getTime()) / 3_600_000
    expect(dayLength).toBeCloseTo(16.8, 1)
    expect(result.daylightHours).toBeCloseTo(dayLength, 9)
    expect(result.hours.every((h) => Math.abs(h - dayLength) < 1e-4)).toBe(true)
    expect(result).toMatchObject({ days: 1, samples: Math.ceil(dayLength * 4) })
  })

  it('gives a spot just north of a tall wall far fewer sun hours', () => {
    // A 3 m wall running east–west; north is up, so "north of it" is above it on the plan.
    const wall = prismFromPolyline(
      [
        { x: -10, y: 0 },
        { x: 10, y: 0 },
      ],
      0.2,
      3,
    )
    const grid = gridForBounds({ minX: -10, minY: -10, maxX: 10, maxY: 10 }, 0.5)
    const north = { x: 0.25, y: -1.25 }
    const south = { x: 0.25, y: 8.75 }
    // In December the sun stays low in the south: no sun at all behind the wall.
    const december = computeSunHours(input({ casters: [wall], grid, days: DEC_21 }))
    expect(hoursAt(december, north)).toBe(0)
    expect(hoursAt(december, south)).toBeCloseTo(december.daylightHours, 5)
    expect(december.daylightHours).toBeCloseTo(7.7, 1)

    // In June the sun is high at noon and in the north early and late, so the spot gets some.
    const june = computeSunHours(input({ casters: [wall], grid }))
    expect(hoursAt(june, north)).toBeLessThan(hoursAt(june, south) - 4)
    expect(hoursAt(june, south)).toBeGreaterThan(june.daylightHours - 0.5)
    // Reference: the spot is shaded when its line to the sun meets the wall's north face
    // (y = −0.1, |x| ≤ 10) lower than 3 m.
    let expected = 0
    for (const sample of daySamples(JUNE_21.date, AMSTERDAM)) {
      const sun = sunPosition(sample.time, AMSTERDAM)
      const towards = sunDirectionOnPlan(sun, 0)
      let shaded = false
      if (towards.y > 0) {
        const distance = (north.y - -0.1) / -towards.y
        const x = north.x + distance * towards.x
        const height = distance * Math.tan((Math.max(sun.altitudeDeg, 1) * Math.PI) / 180)
        shaded = Math.abs(x) <= 10 && height <= 3
      }
      if (!shaded) expected += sample.hours
    }
    expect(hoursAt(june, north)).toBeCloseTo(expected, 3)
  })

  it('follows the north angle', () => {
    // North pointing down the screen: now the spot below the wall is the shaded one.
    const wall = prismFromPolyline(
      [
        { x: -10, y: 0 },
        { x: 10, y: 0 },
      ],
      0.2,
      3,
    )
    const grid = gridForBounds({ minX: -10, minY: -10, maxX: 10, maxY: 10 }, 0.5)
    const result = computeSunHours(
      input({ casters: [wall], grid, days: DEC_21, northAngleDeg: 180 }),
    )
    expect(hoursAt(result, { x: 0.25, y: 1.25 })).toBe(0)
    expect(hoursAt(result, { x: 0.25, y: -8.75 })).toBeCloseTo(result.daylightHours, 5)
  })

  it('averages the growing season', () => {
    const result = computeSunHours(input({ days: { kind: 'season', year: 2026 } }))
    const lengths = daysOf({ kind: 'season', year: 2026 }).map((date) => {
      const times = sunTimes(date, AMSTERDAM)
      return (times.sunset!.getTime() - times.sunrise!.getTime()) / 3_600_000
    })
    const average = lengths.reduce((a, b) => a + b, 0) / lengths.length
    expect(result.days).toBe(6)
    expect(result.daylightHours).toBeCloseTo(average, 9)
    expect(result.hours[0]).toBeCloseTo(average, 4)
  })

  it('leaves cells outside the mask empty', () => {
    const result = computeSunHours(input({ mask: rect(-5, -5, 5, 10) }))
    expect(Number.isNaN(hoursAt(result, { x: -2.5, y: 0.5 }))).toBe(false)
    expect(Number.isNaN(hoursAt(result, { x: 2.5, y: 0.5 }))).toBe(true)
  })

  it('reports progress and can be stopped', () => {
    const fractions: number[] = []
    computeSunHours(input({}), { onProgress: (f) => fractions.push(f) })
    expect(fractions.length).toBeGreaterThan(10)
    expect(fractions.at(-1)).toBe(1)
    expect(fractions.every((f, i) => i === 0 || f > fractions[i - 1]!)).toBe(true)

    const controller = new AbortController()
    let calls = 0
    expect(() =>
      computeSunHours(input({}), {
        signal: controller.signal,
        onProgress: (f) => {
          calls++
          if (f >= 0.5) controller.abort()
        },
      }),
    ).toThrow(expect.objectContaining({ name: 'AbortError' }))
    expect(calls).toBeLessThan(fractions.length)
  })

  it('runs asynchronously in slices', async () => {
    const sync = computeSunHours(input({ casters: [treeCaster({ x: 0, y: 0 }, 4, 8)] }))
    const fractions: number[] = []
    const async = await computeSunHoursAsync(
      input({ casters: [treeCaster({ x: 0, y: 0 }, 4, 8)] }),
      { sliceMs: 0, onProgress: (f) => fractions.push(f) },
    )
    expect(async.hours).toEqual(sync.hours)
    expect(fractions.at(-1)).toBe(1)

    const controller = new AbortController()
    const running = computeSunHoursAsync(input({}), { sliceMs: 0, signal: controller.signal })
    controller.abort()
    await expect(running).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('rejects an invalid grid', () => {
    expect(() =>
      computeSunHours(input({ grid: { originX: 0, originY: 0, cellM: 0, cols: 1, rows: 1 } })),
    ).toThrow(RangeError)
  })

  it('maps 1000 m² for the growing season with 10 casters in well under 5 s', () => {
    const { outline, casters } = sampleGarden()
    const grid = gridForBounds({ minX: 0, minY: 0, maxX: 40, maxY: 25 }, 0.5)
    const start = performance.now()
    const result = computeSunHours({
      casters,
      grid,
      location: AMSTERDAM,
      northAngleDeg: 0,
      days: { kind: 'season', year: 2026 },
      mask: outline,
    })
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(5000)
    expect(result.grid.cols * result.grid.rows).toBe(4000)
    // South of the house it's sunny; north of the tree much less so.
    expect(classifySunHours(hoursAt(result, { x: 11, y: 1 }))).toBe('full-sun')
    expect(hoursAt(result, { x: 8, y: 13 })).toBeLessThan(hoursAt(result, { x: 11, y: 1 }) - 5)
    expect(hoursAt(result, { x: 33, y: 3 })).toBe(0) // inside the shed
  })
})

describe('classification and plant checks', () => {
  it('classifies hours with adjustable thresholds', () => {
    expect(SUN_LEVEL_ORDER).toEqual(SUN_LEVELS)
    expect(classifySunHours(6)).toBe('full-sun')
    expect(classifySunHours(5.9)).toBe('part-shade')
    expect(classifySunHours(3)).toBe('part-shade')
    expect(classifySunHours(2.9)).toBe('shade')
    expect(classifySunHours(NaN)).toBeNull()
    expect(classifySunHours(5, { fullSunHours: 5, partShadeHours: 2 })).toBe('full-sun')
    expect(Array.from(classifyGrid({ hours: new Float32Array([8, 4, 1, NaN]) }))).toEqual([
      0,
      1,
      2,
      NO_SUN_LEVEL,
    ])
  })

  /** 4 × 1 cells of 1 m: full sun, full sun, part shade, shade. */
  const strip = {
    grid: { originX: 0, originY: 0, cellM: 1, cols: 4, rows: 1 },
    hours: new Float32Array([8, 7, 4, 1]),
  }

  it('finds the level covering most of a canopy', () => {
    expect(sunLevelShares(strip, { x: 1.5, y: 0.5 }, 1.1)).toEqual({
      'full-sun': 2 / 3,
      'part-shade': 1 / 3,
      shade: 0,
    })
    expect(dominantSunLevel(strip, { x: 1.5, y: 0.5 }, 1.1)).toBe('full-sun')
    expect(dominantSunLevel(strip, { x: 3, y: 0.5 }, 0.6)).toBe('part-shade') // a tie
    // A small plant uses the cell it stands in; off the map there is no answer.
    expect(dominantSunLevel(strip, { x: 3.7, y: 0.2 }, 0.1)).toBe('shade')
    expect(dominantSunLevel(strip, { x: 10, y: 10 }, 0.5)).toBeNull()
  })

  it('flags plants whose sun needs do not match their spot', () => {
    expect(sunMismatch({ sun: ['full-sun'] }, 'shade')).toBe(true)
    expect(sunMismatch({ sun: ['full-sun', 'part-shade'] }, 'part-shade')).toBe(false)
    expect(sunMismatch({ sun: ['shade'] }, null)).toBe(false)
  })
})
