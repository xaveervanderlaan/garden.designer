import { pointInPolygon } from '../geometry/polygon'
import { findPlant, plantingRadiusM, soilSuitability } from './plants'
import { hasPlot } from './plot'
import type { Plant, Planting, Project } from './schema'

/**
 * Planting warnings, computed from the design (never stored). Later milestones add kinds (sun
 * mismatch in M12) and options (sizes for a growth year in M13).
 */

export type Warning =
  /** Two plants overlap by more than the threshold at the size they're drawn. */
  | { kind: 'overlap'; plantingId: string; otherId: string; fraction: number }
  /** The plant's centre lies outside the plot boundary. */
  | { kind: 'outside-plot'; plantingId: string }
  /** The plant doesn't suit the design's soil, or the soil (sand) is too dry for it. */
  | { kind: 'soil'; plantingId: string; suitability: 'dry' | 'unsuited' }

export type WarningKind = Warning['kind']

/**
 * `warning`: something is wrong (overlap, outside the plot, wrong soil). `notice`: worth knowing,
 * but often fine (a plant that needs watering on sand).
 */
export type Severity = 'warning' | 'notice'

export function warningSeverity(warning: Warning): Severity {
  return warning.kind === 'soil' && warning.suitability === 'dry' ? 'notice' : 'warning'
}

/** The most serious severity among some warnings. */
export function worstSeverity(warnings: readonly Warning[]): Severity {
  return warnings.some((w) => warningSeverity(w) === 'warning') ? 'warning' : 'notice'
}

export type WarningOptions = {
  /** Radius (m) each planting is checked at; default: half its mature spread. */
  radiusM?: (planting: Planting) => number
}

export type Circle = { id: string; x: number; y: number; r: number }

/** How much two circles overlap, as a fraction of the smaller circle's diameter (0 = touching). */
export function overlapFraction(a: Omit<Circle, 'id'>, b: Omit<Circle, 'id'>): number {
  const smaller = Math.min(a.r, b.r)
  if (!(smaller > 0)) return 0
  const depth = a.r + b.r - Math.hypot(a.x - b.x, a.y - b.y)
  return depth > 0 ? Math.min(depth / (2 * smaller), 1) : 0
}

/**
 * Every pair of circles overlapping by more than `threshold` (see overlapFraction), found with a
 * sweep along x so large designs stay fast. `ignore` skips pairs that are meant to touch.
 */
export function findOverlaps(
  circles: readonly Circle[],
  threshold: number,
  ignore?: (a: Circle, b: Circle) => boolean,
): Array<{ a: Circle; b: Circle; fraction: number }> {
  const sorted = [...circles].sort((p, q) => p.x - p.r - (q.x - q.r))
  const found: Array<{ a: Circle; b: Circle; fraction: number }> = []
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]!
    const right = a.x + a.r
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j]!
      if (b.x - b.r >= right) break
      const fraction = overlapFraction(a, b)
      if (fraction > threshold && !ignore?.(a, b)) found.push({ a, b, fraction })
    }
  }
  return found
}

/** All warnings for the design's plantings. */
export function plantingWarnings(project: Project, options: WarningOptions = {}): Warning[] {
  const radiusM = options.radiusM ?? ((planting: Planting) => plantingRadiusM(project, planting))
  const plants = new Map<string, Plant | undefined>()
  const plantOf = (planting: Planting) => {
    if (!plants.has(planting.plantId)) {
      plants.set(planting.plantId, findPlant(project, planting.plantId))
    }
    return plants.get(planting.plantId)
  }
  const warnings: Warning[] = []

  // Overlaps. A hedge is planted to close up, so hedging plants may overlap each other.
  const categories = new Map<string, Plant['category'] | undefined>()
  const circles = project.plantings.map((planting) => {
    categories.set(planting.id, plantOf(planting)?.category)
    return { id: planting.id, x: planting.position.x, y: planting.position.y, r: radiusM(planting) }
  })
  const bothHedges = (a: Circle, b: Circle) =>
    categories.get(a.id) === 'hedge' && categories.get(b.id) === 'hedge'
  const order = new Map(project.plantings.map((p, i) => [p.id, i]))
  for (const { a, b, fraction } of findOverlaps(
    circles,
    project.settings.overlapThreshold,
    bothHedges,
  )) {
    // Report each pair in design order, so the result doesn't depend on the sweep.
    const [first, second] = order.get(a.id)! < order.get(b.id)! ? [a, b] : [b, a]
    warnings.push({ kind: 'overlap', plantingId: first.id, otherId: second.id, fraction })
  }

  const plot = hasPlot(project) ? project.plot.outline : null
  const soil = project.settings.soil
  for (const planting of project.plantings) {
    if (plot && !pointInPolygon(planting.position, plot)) {
      warnings.push({ kind: 'outside-plot', plantingId: planting.id })
    }
    const plant = plantOf(planting)
    const suitability = plant ? soilSuitability(plant, soil) : 'suited'
    if (suitability !== 'suited') {
      warnings.push({ kind: 'soil', plantingId: planting.id, suitability })
    }
  }

  return warnings.sort((a, b) => order.get(a.plantingId)! - order.get(b.plantingId)!)
}

const cache = new WeakMap<Project, Warning[]>()

/**
 * plantingWarnings with the default options, remembered per project version (projects are never
 * changed in place), so the plan and the warnings list share the work.
 */
export function designWarnings(project: Project): Warning[] {
  let warnings = cache.get(project)
  if (!warnings) {
    warnings = plantingWarnings(project)
    cache.set(project, warnings)
  }
  return warnings
}

/** Warnings per planting id; an overlap is listed under both plants. */
export function warningsByPlanting(warnings: readonly Warning[]): Map<string, Warning[]> {
  const map = new Map<string, Warning[]>()
  const add = (id: string, warning: Warning) => {
    const list = map.get(id)
    if (list) list.push(warning)
    else map.set(id, [warning])
  }
  for (const warning of warnings) {
    add(warning.plantingId, warning)
    if (warning.kind === 'overlap') add(warning.otherId, warning)
  }
  return map
}

/**
 * Warnings grouped for the warnings list: one entry per kind and species (per pair of species for
 * overlaps), with every planting involved, so a bed full of one plant gives one line.
 */
export type WarningGroup = {
  key: string
  kind: WarningKind
  /** The species involved: one, or two for an overlap between different species. */
  plantIds: string[]
  suitability?: 'dry' | 'unsuited'
  /** Number of warnings in the group. */
  count: number
  plantingIds: string[]
}

export function groupWarnings(project: Project, warnings: readonly Warning[]): WarningGroup[] {
  const plantIdOf = new Map(project.plantings.map((p) => [p.id, p.plantId]))
  const groups = new Map<string, WarningGroup & { ids: Set<string> }>()
  for (const warning of warnings) {
    const plantId = plantIdOf.get(warning.plantingId) ?? ''
    let key: string
    let plantIds: string[]
    const ids = [warning.plantingId]
    if (warning.kind === 'overlap') {
      const otherPlantId = plantIdOf.get(warning.otherId) ?? ''
      plantIds = plantId === otherPlantId ? [plantId] : [plantId, otherPlantId].sort()
      key = `overlap:${plantIds.join('|')}`
      ids.push(warning.otherId)
    } else {
      plantIds = [plantId]
      key = `${warning.kind}:${plantId}`
    }
    let group = groups.get(key)
    if (!group) {
      group = {
        key,
        kind: warning.kind,
        plantIds,
        ...(warning.kind === 'soil' ? { suitability: warning.suitability } : {}),
        count: 0,
        plantingIds: [],
        ids: new Set(),
      }
      groups.set(key, group)
    }
    group.count += 1
    for (const id of ids) group.ids.add(id)
  }
  return [...groups.values()].map(({ ids, ...group }) => ({ ...group, plantingIds: [...ids] }))
}
