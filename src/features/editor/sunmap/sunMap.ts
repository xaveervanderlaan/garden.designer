import { boundsOfPoints } from '../../../geometry/bounds'
import { projectCasters } from '../../../geometry/projectCasters'
import {
  type DayChoice,
  gridForBounds,
  NO_SUN_LEVEL,
  SUN_LEVEL_ORDER,
  type SunHoursInput,
} from '../../../geometry/sunHours'
import type { GrowthView } from '../../../model/growth'
import { hasPlot } from '../../../model/plot'
import type { Project, SunLevel } from '../../../model/schema'
import { SUN_MAP_STYLE } from '../../../styles/elementStyles'
import { growthPlantSize } from '../view/sunView'

export type SunMapRequest = { day: DayChoice; cellM: number; year: GrowthView }

export const SUN_MAP_CELL_SIZES = [0.25, 0.5, 1, 2] as const

/**
 * The worker input for a request: the grid covers the plot's bounding box and is masked to the
 * plot; casters are sized for the request's growth year. Null without a plot.
 */
export function sunMapInput(project: Project, request: SunMapRequest): SunHoursInput | null {
  if (!hasPlot(project)) return null
  const outline = project.plot.outline
  const bounds = boundsOfPoints(outline)
  if (!bounds) return null
  return {
    casters: projectCasters(project, { plantSize: growthPlantSize(request.year) }),
    grid: gridForBounds(bounds, request.cellM),
    location: project.settings.location,
    northAngleDeg: project.settings.northAngleDeg,
    days: request.day,
    mask: outline,
  }
}

/** Identifies an input: equal keys give equal maps. */
export const sunMapKey = (input: SunHoursInput): string => JSON.stringify(input)

const hexToRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
]

/** RGBA pixels (one per cell) of the classified grid; masked cells are transparent. */
export function sunMapPixels(levels: Uint8Array): Uint8ClampedArray {
  const rgb = SUN_LEVEL_ORDER.map((level) => hexToRgb(SUN_MAP_STYLE.colors[level]))
  const pixels = new Uint8ClampedArray(levels.length * 4)
  levels.forEach((level, i) => {
    if (level === NO_SUN_LEVEL) return
    const [r, g, b] = rgb[level]!
    pixels.set([r, g, b, 255], i * 4)
  })
  return pixels
}

/** Share (0..1) of the masked cells at each level. */
export function levelShares(levels: Uint8Array): Record<SunLevel, number> {
  const counts = SUN_LEVEL_ORDER.map(() => 0)
  let total = 0
  for (const level of levels) {
    if (level === NO_SUN_LEVEL) continue
    counts[level]!++
    total++
  }
  return Object.fromEntries(
    SUN_LEVEL_ORDER.map((level, i) => [level, total ? counts[i]! / total : 0]),
  ) as Record<SunLevel, number>
}
