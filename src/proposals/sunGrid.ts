import {
  SUN_LEVEL_ORDER,
  cellCentre,
  classifySunHours,
  type SunHoursResult,
  type SunThresholds,
} from '../geometry/sunHours'

/** A sun-hours map in big cells, as text: one character per cell, rows from the top. */
export type CoarseSunMap = { originX: number; originY: number; cellM: number; rows: string[] }

/** F = full sun, P = part shade, S = shade (SUN_LEVEL_ORDER); '.' = outside the plot. */
const CODES = ['F', 'P', 'S'] as const

/**
 * Downsamples a sun-hours map to `cellM` cells (same origin). Each big cell shows the class most
 * of its small cells have (ties go to the sunnier class); '.' when none lies inside the mask.
 */
export function coarseSunMap(
  result: Pick<SunHoursResult, 'grid' | 'hours'>,
  thresholds: SunThresholds,
  cellM = 2,
): CoarseSunMap {
  const { grid } = result
  const cols = Math.max(1, Math.ceil((grid.cols * grid.cellM) / cellM - 1e-9))
  const rowCount = Math.max(1, Math.ceil((grid.rows * grid.cellM) / cellM - 1e-9))
  const counts = new Uint32Array(cols * rowCount * CODES.length)
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      const level = classifySunHours(result.hours[row * grid.cols + col] ?? NaN, thresholds)
      if (!level) continue
      const centre = cellCentre(grid, col, row)
      const c = Math.min(cols - 1, Math.floor((centre.x - grid.originX) / cellM))
      const r = Math.min(rowCount - 1, Math.floor((centre.y - grid.originY) / cellM))
      counts[(r * cols + c) * CODES.length + SUN_LEVEL_ORDER.indexOf(level)]! += 1
    }
  }
  const rows: string[] = []
  for (let r = 0; r < rowCount; r++) {
    let text = ''
    for (let c = 0; c < cols; c++) {
      const base = (r * cols + c) * CODES.length
      let best = -1
      let bestCount = 0
      CODES.forEach((_, i) => {
        if (counts[base + i]! > bestCount) {
          best = i
          bestCount = counts[base + i]!
        }
      })
      text += best < 0 ? '.' : CODES[best]
    }
    rows.push(text)
  }
  return { originX: grid.originX, originY: grid.originY, cellM, rows }
}
