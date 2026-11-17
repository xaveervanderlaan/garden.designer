import { useMemo } from 'react'
import {
  type GrowthStopId,
  type GrowthView,
  growthReferenceYear,
  growthStops,
} from '../../../model/growth'
import type { Project } from '../../../model/schema'
import { useUiStore } from '../../../store/uiStore'
import type { PlantView } from '../../../styles/plantAppearance'
import { currentYear } from '../actions'

/**
 * The view bar's year and month (uiStore: `growthStop`, `month`) as a `PlantView` for drawing and
 * checking plants. The year stops count from the design's earliest planting year
 * (`growthReferenceYear`), so "planting year" stays the year the garden is planted.
 *
 * Anything else that depends on plant sizes uses the same year, e.g. tree shadows:
 * `plantSizeAt(plant, planting.plantedYear, year)` when `isPlanted(planting.plantedYear, year)`
 * (not planted yet: no shadow), see `designShadow`.
 */

/** The growth year a slider stop shows for a design. */
export function growthViewOf(
  project: Pick<Project, 'plantings'>,
  stop: GrowthStopId,
  fallbackYear = currentYear(),
): GrowthView {
  if (stop === 'mature') return 'mature'
  return growthStops(growthReferenceYear(project, fallbackYear)).find((s) => s.id === stop)!.view
}

/** The view the plan shows now (outside React, e.g. in commands). */
export function currentPlantView(project: Pick<Project, 'plantings'>): PlantView {
  const { growthStop, month } = useUiStore.getState()
  return { year: growthViewOf(project, growthStop), month }
}

/** The view the plan shows; the same object as long as the year and month stay the same. */
export function usePlantView(project: Pick<Project, 'plantings'> | null): PlantView {
  const stop = useUiStore((s) => s.growthStop)
  const month = useUiStore((s) => s.month)
  const year = project ? growthViewOf(project, stop) : 'mature'
  return useMemo(() => ({ year, month }), [year, month])
}

/** The month after (step 1) or before (step −1) `month`; from "no month" to January / December. */
export function stepMonth(month: number | null, step: 1 | -1): number {
  if (month === null) return step === 1 ? 1 : 12
  return ((month - 1 + step + 12) % 12) + 1
}
