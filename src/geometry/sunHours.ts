import type { Plant, Point, SunLevel } from '../model/schema'
import type { Bounds } from './bounds'
import { type Caster, type Ring, shadowPieces, type ShadowPiece } from './shadows'
import {
  DEFAULT_TIME_ZONE,
  type GeoLocation,
  type LocalDate,
  shadowVector,
  sunPosition,
  sunTimes,
} from './sun'

/**
 * The sun-hours map (SPEC §4.5, PLAN M12): hours of direct sun per spot on a day, or averaged
 * over the growing season. Pure and synchronous at heart (`sunHoursJob` is a generator that does
 * one sun sample per step), so it runs the same in tests, on the main thread and in the worker.
 *
 * - **Grid**: square cells of `cellM` metres over a box on the plan (metres, x right, y down);
 *   cell (col, row) has its centre at origin + ((col + ½) × cellM, (row + ½) × cellM). Arrays are
 *   row-major: index = row × cols + col. A spot is in the sun when its cell centre is.
 * - **Sampling**: from sunrise to sunset in steps of `stepMinutes` (15); each step is sampled at
 *   its middle and counts for its length (the last one may be shorter). Between sunrise and
 *   sunset the sun counts as up (shadows use `shadowVector`), before and after it there are no
 *   samples, so open ground gets exactly the day length.
 * - **Shadow test**: per sample, the casters' shadow pieces (shadows.ts) are scan-converted onto
 *   the grid within their bounding boxes; that's the same even-odd test as pointInPolygon on
 *   every cell centre, but only for the rows and columns a piece can cover.
 */

/** The sun levels in SUN_LEVELS order (repeated here so the worker needn't load zod). */
export const SUN_LEVEL_ORDER = [
  'full-sun',
  'part-shade',
  'shade',
] as const satisfies readonly SunLevel[]

export const DEFAULT_CELL_M = 0.5
export const DEFAULT_STEP_MINUTES = 15
/** gridForBounds makes cells bigger rather than exceed this (memory and time stay bounded). */
export const MAX_GRID_CELLS = 250_000

/** The growing season: the 15th of April to September (SPEC §4.5). */
export const GROWING_SEASON_MONTHS = [4, 5, 6, 7, 8, 9] as const
export const GROWING_SEASON_DAY = 15

export type SunGrid = {
  originX: number
  originY: number
  cellM: number
  cols: number
  rows: number
}

/** A single day, or the growing season of a year (its days averaged). */
export type DayChoice = { kind: 'date'; date: LocalDate } | { kind: 'season'; year: number }

export type SunThresholds = { fullSunHours: number; partShadeHours: number }
/** Full sun ≥ 6 h, part shade 3–6 h, shade < 3 h (SPEC §4.5). */
export const DEFAULT_SUN_THRESHOLDS: SunThresholds = { fullSunHours: 6, partShadeHours: 3 }

export type SunHoursInput = {
  casters: Caster[]
  grid: SunGrid
  location: GeoLocation
  northAngleDeg: number
  days: DayChoice
  /** Default DEFAULT_STEP_MINUTES. */
  stepMinutes?: number
  /** Default DEFAULT_TIME_ZONE (the days are calendar days there). */
  timeZone?: string
  /** Only cells whose centre lies inside this polygon (e.g. the plot) are computed. */
  mask?: Point[]
}

export type SunHoursResult = {
  grid: SunGrid
  /** Hours of direct sun per day (averaged over the days), per cell; NaN outside the mask. */
  hours: Float32Array
  /** Hours the sun is up per day, averaged over the days: what open ground gets. */
  daylightHours: number
  /** Number of days averaged and sun samples taken. */
  days: number
  samples: number
}

// --- Grid -----------------------------------------------------------------------------------

/**
 * A grid covering the bounds. If that would take more than `maxCells` cells, the cells are made
 * bigger (rounded up to whole centimetres).
 */
export function gridForBounds(
  bounds: Bounds,
  cellM = DEFAULT_CELL_M,
  maxCells = MAX_GRID_CELLS,
): SunGrid {
  const width = Math.max(bounds.maxX - bounds.minX, 0)
  const height = Math.max(bounds.maxY - bounds.minY, 0)
  let size = cellM
  const count = (s: number) =>
    Math.max(1, Math.ceil(width / s)) * Math.max(1, Math.ceil(height / s))
  if (count(size) > maxCells) {
    size = Math.ceil(Math.sqrt((width * height) / maxCells) * 100) / 100
    while (count(size) > maxCells) size += 0.01
  }
  return {
    originX: bounds.minX,
    originY: bounds.minY,
    cellM: size,
    cols: Math.max(1, Math.ceil(width / size)),
    rows: Math.max(1, Math.ceil(height / size)),
  }
}

export function cellCentre(grid: SunGrid, col: number, row: number): Point {
  return {
    x: grid.originX + (col + 0.5) * grid.cellM,
    y: grid.originY + (row + 0.5) * grid.cellM,
  }
}

/** Index of the cell containing the point, or -1 outside the grid. */
export function cellIndexAt(grid: SunGrid, p: Point): number {
  const col = Math.floor((p.x - grid.originX) / grid.cellM)
  const row = Math.floor((p.y - grid.originY) / grid.cellM)
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return -1
  return row * grid.cols + col
}

/**
 * Calls `visit` with the index of every cell whose centre lies in the piece (scan conversion
 * within the piece's bounding box).
 */
export function forEachCellIn(piece: ShadowPiece, grid: SunGrid, visit: (index: number) => void) {
  const { originX, originY, cellM, cols, rows } = grid
  const { bounds } = piece
  const row0 = Math.max(0, Math.ceil((bounds.minY - originY) / cellM - 0.5))
  const row1 = Math.min(rows - 1, Math.floor((bounds.maxY - originY) / cellM - 0.5))
  if (row0 > row1) return

  if (piece.kind === 'capsule') {
    const col0 = Math.max(0, Math.ceil((bounds.minX - originX) / cellM - 0.5))
    const col1 = Math.min(cols - 1, Math.floor((bounds.maxX - originX) / cellM - 0.5))
    const { a, b, radiusM } = piece
    const dx = b.x - a.x
    const dy = b.y - a.y
    const lengthSquared = dx * dx + dy * dy
    const r2 = radiusM * radiusM
    for (let row = row0; row <= row1; row++) {
      const y = originY + (row + 0.5) * cellM
      for (let col = col0; col <= col1; col++) {
        const x = originX + (col + 0.5) * cellM
        let t = lengthSquared === 0 ? 0 : ((x - a.x) * dx + (y - a.y) * dy) / lengthSquared
        t = t < 0 ? 0 : t > 1 ? 1 : t
        const px = a.x + t * dx - x
        const py = a.y + t * dy - y
        if (px * px + py * py <= r2) visit(row * cols + col)
      }
    }
    return
  }

  // Even-odd scanline: a cell centre is inside when x(2k) ≤ x < x(2k+1) for the sorted crossings,
  // exactly the rule pointInPolygon applies.
  const crossings: number[] = []
  for (let row = row0; row <= row1; row++) {
    const y = originY + (row + 0.5) * cellM
    crossings.length = 0
    for (const ring of piece.rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [ax, ay] = ring[i]!
        const [bx, by] = ring[j]!
        if (ay > y !== by > y) crossings.push(ax + ((y - ay) * (bx - ax)) / (by - ay))
      }
    }
    if (crossings.length < 2) continue
    crossings.sort((p, q) => p - q)
    for (let k = 0; k + 1 < crossings.length; k += 2) {
      const col0 = Math.max(0, Math.ceil((crossings[k]! - originX) / cellM - 0.5))
      const col1 = Math.min(cols - 1, Math.ceil((crossings[k + 1]! - originX) / cellM - 0.5) - 1)
      for (let col = col0; col <= col1; col++) visit(row * cols + col)
    }
  }
}

function maskCells(grid: SunGrid, mask: Point[]): Uint8Array {
  const inside = new Uint8Array(grid.cols * grid.rows)
  const ring: Ring = mask.map((p) => [p.x, p.y])
  if (ring.length < 3) return inside
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of ring) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  const piece: ShadowPiece = { kind: 'polygon', rings: [ring], bounds: { minX, minY, maxX, maxY } }
  forEachCellIn(piece, grid, (index) => {
    inside[index] = 1
  })
  return inside
}

// --- Days and samples -----------------------------------------------------------------------

export function daysOf(choice: DayChoice): LocalDate[] {
  if (choice.kind === 'date') return [choice.date]
  return GROWING_SEASON_MONTHS.map((month) => ({
    year: choice.year,
    month,
    day: GROWING_SEASON_DAY,
  }))
}

/** A moment to sample (epoch ms) and how many hours it stands for. */
export type SunSample = { time: number; hours: number }

/** The samples for one day: the middle of every step from sunrise to sunset. */
export function daySamples(
  date: LocalDate,
  location: GeoLocation,
  stepMinutes = DEFAULT_STEP_MINUTES,
  timeZone = DEFAULT_TIME_ZONE,
): SunSample[] {
  const times = sunTimes(date, location, timeZone)
  let start: number
  let end: number
  if (times.sunrise && times.sunset) {
    start = times.sunrise.getTime()
    end = times.sunset.getTime()
  } else if (times.alwaysUp) {
    start = times.solarNoon.getTime() - 12 * 3_600_000
    end = times.solarNoon.getTime() + 12 * 3_600_000
  } else {
    return []
  }
  const stepMs = stepMinutes * 60_000
  const samples: SunSample[] = []
  for (let from = start; from < end; from += stepMs) {
    const to = Math.min(from + stepMs, end)
    samples.push({ time: (from + to) / 2, hours: (to - from) / 3_600_000 })
  }
  return samples
}

// --- The computation ------------------------------------------------------------------------

/**
 * The computation as a generator: every `next()` takes one sun sample and yields the fraction
 * done (0–1); the return value is the result. Lets callers report progress and stop (or pause
 * for other work) between samples.
 */
export function* sunHoursJob(input: SunHoursInput): Generator<number, SunHoursResult, void> {
  const { casters, grid, location, northAngleDeg } = input
  const stepMinutes = input.stepMinutes ?? DEFAULT_STEP_MINUTES
  if (!(stepMinutes > 0)) throw new RangeError('stepMinutes must be positive')
  if (!(grid.cellM > 0) || !(grid.cols >= 1) || !(grid.rows >= 1)) {
    throw new RangeError('Invalid sun-hours grid')
  }
  const timeZone = input.timeZone ?? DEFAULT_TIME_ZONE
  const days = daysOf(input.days)
  const samples = days.flatMap((day) => daySamples(day, location, stepMinutes, timeZone))

  const cellCount = grid.cols * grid.rows
  /** Hours each cell spent in shade while the sun was up. */
  const shadeHours = new Float64Array(cellCount)
  /** The last sample (1-based) that shaded each cell, so overlapping pieces count once. */
  const shadedBy = new Int32Array(cellCount)
  let sunUpHours = 0

  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i]!
    const step = shadowVector(sunPosition(sample.time, location), northAngleDeg)
    sunUpHours += sample.hours
    const id = i + 1
    const visit = (index: number) => {
      if (shadedBy[index] !== id) {
        shadedBy[index] = id
        shadeHours[index]! += sample.hours
      }
    }
    for (const piece of shadowPieces(casters, step)) forEachCellIn(piece, grid, visit)
    yield (i + 1) / samples.length
  }

  const inside = input.mask ? maskCells(grid, input.mask) : null
  const dayCount = Math.max(days.length, 1)
  const hours = new Float32Array(cellCount)
  for (let index = 0; index < cellCount; index++) {
    hours[index] = inside && !inside[index] ? NaN : (sunUpHours - shadeHours[index]!) / dayCount
  }
  return {
    grid,
    hours,
    daylightHours: sunUpHours / dayCount,
    days: days.length,
    samples: samples.length,
  }
}

export type SunHoursOptions = {
  /** Called after every sample with the fraction done (0–1). */
  onProgress?: (fraction: number) => void
  /** Checked between samples; when aborted, the computation throws `signal.reason`. */
  signal?: AbortSignal
}

/** Runs the whole computation synchronously. */
export function computeSunHours(input: SunHoursInput, options: SunHoursOptions = {}) {
  const job = sunHoursJob(input)
  for (;;) {
    options.signal?.throwIfAborted()
    const next = job.next()
    if (next.done) return next.value
    options.onProgress?.(next.value)
  }
}

/**
 * Runs the computation in slices of about `sliceMs`, letting the event loop run in between, so
 * that a worker can receive a cancel message (which aborts `signal`) while it computes.
 */
export async function computeSunHoursAsync(
  input: SunHoursInput,
  options: SunHoursOptions & { sliceMs?: number } = {},
): Promise<SunHoursResult> {
  const sliceMs = options.sliceMs ?? 30
  const job = sunHoursJob(input)
  let sliceStart = Date.now()
  for (;;) {
    options.signal?.throwIfAborted()
    const next = job.next()
    if (next.done) return next.value
    options.onProgress?.(next.value)
    if (Date.now() - sliceStart >= sliceMs) {
      await new Promise((resolve) => setTimeout(resolve, 0))
      sliceStart = Date.now()
    }
  }
}

// --- Classification and plant checks ------------------------------------------------------

/** The sun level for a number of sun hours; null for NaN (outside the mask). */
export function classifySunHours(
  hours: number,
  thresholds: SunThresholds = DEFAULT_SUN_THRESHOLDS,
): SunLevel | null {
  if (Number.isNaN(hours)) return null
  if (hours >= thresholds.fullSunHours) return 'full-sun'
  if (hours >= thresholds.partShadeHours) return 'part-shade'
  return 'shade'
}

/** Code used by classifyGrid for cells outside the mask. */
export const NO_SUN_LEVEL = 255

/** Per cell, the index of its level in SUN_LEVEL_ORDER (= SUN_LEVELS), or NO_SUN_LEVEL. */
export function classifyGrid(
  result: Pick<SunHoursResult, 'hours'>,
  thresholds: SunThresholds = DEFAULT_SUN_THRESHOLDS,
): Uint8Array {
  const levels = new Uint8Array(result.hours.length)
  result.hours.forEach((hours, index) => {
    const level = classifySunHours(hours, thresholds)
    levels[index] = level ? SUN_LEVEL_ORDER.indexOf(level) : NO_SUN_LEVEL
  })
  return levels
}

/**
 * Share of each sun level within a circle (e.g. a plant's canopy), by the cells whose centre lies
 * in it; a circle smaller than a cell uses the cell under its centre. All zero when the circle has
 * no cells on the grid (or only cells outside the mask).
 */
export function sunLevelShares(
  result: Pick<SunHoursResult, 'grid' | 'hours'>,
  centre: Point,
  radiusM: number,
  thresholds: SunThresholds = DEFAULT_SUN_THRESHOLDS,
): Record<SunLevel, number> {
  const counts: Record<SunLevel, number> = { 'full-sun': 0, 'part-shade': 0, shade: 0 }
  let total = 0
  const count = (index: number) => {
    const level = classifySunHours(result.hours[index]!, thresholds)
    if (!level) return
    counts[level]++
    total++
  }
  const r = Math.max(radiusM, 0)
  const piece: ShadowPiece = {
    kind: 'capsule',
    a: centre,
    b: centre,
    radiusM: r,
    bounds: { minX: centre.x - r, minY: centre.y - r, maxX: centre.x + r, maxY: centre.y + r },
  }
  forEachCellIn(piece, result.grid, count)
  if (total === 0) {
    const index = cellIndexAt(result.grid, centre)
    if (index >= 0) count(index)
  }
  for (const level of SUN_LEVEL_ORDER) counts[level] = total ? counts[level] / total : 0
  return counts
}

/** The level covering most of the circle (ties go to the sunnier one); null when off the map. */
export function dominantSunLevel(
  result: Pick<SunHoursResult, 'grid' | 'hours'>,
  centre: Point,
  radiusM: number,
  thresholds: SunThresholds = DEFAULT_SUN_THRESHOLDS,
): SunLevel | null {
  const shares = sunLevelShares(result, centre, radiusM, thresholds)
  let best: SunLevel | null = null
  for (const level of SUN_LEVEL_ORDER) {
    if (shares[level] > 0 && (!best || shares[level] > shares[best])) best = level
  }
  return best
}

/** True when the plant doesn't do well in the spot's sun level (a sun-mismatch warning). */
export function sunMismatch(plant: Pick<Plant, 'sun'>, level: SunLevel | null): boolean {
  return level !== null && !plant.sun.includes(level)
}
