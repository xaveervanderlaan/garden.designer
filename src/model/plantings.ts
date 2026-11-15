import { fillPositions } from '../geometry/planting'
import { polygonArea, roundPoint } from '../geometry/polygon'
import { findBed, relinkBeds } from './beds'
import { newId } from './ids'
import { findPlant, plantName, plantRadiusM, plantingRadiusM } from './plants'
import type { Plant, Planting, Point, Project } from './schema'
import { overlapFraction } from './warnings'

/** Placing plants on the plan and changing them. */

export const MIN_PLANTED_YEAR = 1900
export const MAX_PLANTED_YEAR = 2200

/**
 * Adds plantings of one plant at the given positions (one change, so one undo step). Each is
 * linked to the bed it lands in.
 */
export function addPlantings(
  project: Project,
  plantId: string,
  positions: readonly Point[],
  plantedYear: number,
): { project: Project; ids: string[] } {
  if (positions.length === 0) return { project, ids: [] }
  const added: Planting[] = positions.map((position) => ({
    id: newId(),
    plantId,
    position: roundPoint(position),
    plantedYear,
  }))
  const ids = added.map((p) => p.id)
  const next = relinkBeds({ ...project, plantings: [...project.plantings, ...added] }, new Set(ids))
  return { project: next, ids }
}

/** Swaps the species of the given plantings, keeping their place, year and notes. */
export function swapSpecies(project: Project, ids: ReadonlySet<string>, plantId: string): Project {
  if (!project.plantings.some((p) => ids.has(p.id) && p.plantId !== plantId)) return project
  return {
    ...project,
    plantings: project.plantings.map((p) =>
      ids.has(p.id) && p.plantId !== plantId ? { ...p, plantId } : p,
    ),
  }
}

/**
 * Numbered species codes (1, 2, 3, …) for labels and the planting list, in the order the species
 * first appear in the design. They don't depend on the language, and only change when a species
 * disappears from the plan entirely.
 */
export function speciesCodes(project: Pick<Project, 'plantings'>): Map<string, number> {
  const codes = new Map<string, number>()
  for (const planting of project.plantings) {
    if (!codes.has(planting.plantId)) codes.set(planting.plantId, codes.size + 1)
  }
  return codes
}

/**
 * The label of every planting on the plan: the plant's name (in `lang`) or its species code. A
 * plant that can't be found has no name, so it gets no name label.
 */
export function plantingLabels(
  project: Project,
  mode: 'name' | 'code',
  lang: 'en' | 'nl',
): Map<string, string> {
  const codes = speciesCodes(project)
  const names = new Map<string, string>()
  const labels = new Map<string, string>()
  for (const planting of project.plantings) {
    let label: string | undefined
    if (mode === 'name') {
      label = names.get(planting.plantId)
      if (label === undefined) {
        const plant = findPlant(project, planting.plantId)
        label = plant ? plantName(plant, lang) : ''
        names.set(planting.plantId, label)
      }
    } else {
      label = String(codes.get(planting.plantId))
    }
    if (label) labels.set(planting.id, label)
  }
  return labels
}

/** Hedging plants go in at 3 per metre; the hedge closes up into its full width. */
export const HEDGE_ROW_SPACING_M = 0.33

/**
 * Default distance between plants in a row: 3 per metre for a hedge, the in-row spacing for
 * vegetables, herbs and fruit, otherwise the plant's spread (they just touch when grown).
 */
export function defaultRowSpacingM(plant: Plant): number {
  if (plant.category === 'hedge') return Math.min(HEDGE_ROW_SPACING_M, plant.spreadM)
  return plant.veg?.inRowSpacingM ?? plant.spreadM
}

/** Fills with more plants than this are refused (the spacing is probably a typo). */
export const MAX_FILL_PLANTS = 2000

export type FillResult = {
  positions: Point[]
  /** True when the spacing is so small that the bed would get more than MAX_FILL_PLANTS. */
  tooMany: boolean
}

/**
 * Where "fill bed" puts plants of `plantId`, `spacingM` apart (see fillPositions). Spots where the
 * new plant would overlap a plant that is already there (by more than the warning threshold) are
 * skipped, so filling the rest of a bed around a shrub works.
 */
export function fillBedPositions(
  project: Project,
  bedId: string,
  plantId: string,
  spacingM: number,
): FillResult {
  const bed = findBed(project, bedId)
  if (!bed || !(spacingM > 0)) return { positions: [], tooMany: false }
  // A staggered pattern has one plant per spacing² × √3/2; refuse early rather than freeze.
  if (polygonArea(bed.shape.points) / (spacingM * spacingM * 0.866) > MAX_FILL_PLANTS * 1.2) {
    return { positions: [], tooMany: true }
  }
  const radius = plantRadiusM(findPlant(project, plantId))
  const existing = project.plantings.map((p) => ({
    x: p.position.x,
    y: p.position.y,
    r: plantingRadiusM(project, p),
  }))
  const threshold = project.settings.overlapThreshold
  const positions = fillPositions(bed.shape.points, spacingM).filter((p) => {
    const circle = { x: p.x, y: p.y, r: radius }
    return !existing.some((other) => overlapFraction(circle, other) > threshold)
  })
  return positions.length > MAX_FILL_PLANTS
    ? { positions: [], tooMany: true }
    : { positions, tooMany: false }
}
