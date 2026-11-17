import { objectBounds } from '../geometry/bounds'
import { distanceToPolyline, pointInPolygon } from '../geometry/polygon'
import { MIN_SHADOW_PLANT_HEIGHT_M, SHADOW_PLANT_CATEGORIES } from '../geometry/projectCasters'
import { dominantSunLevel, type SunHoursResult } from '../geometry/sunHours'
import { type GrowthView, isPlanted, plantingRadiusAtM, plantSizeAt } from './growth'
import { findPlant, soilSuitability } from './plants'
import { STRUCTURE_OVERLAP_KINDS } from './objectKinds'
import { hasPlot } from './plot'
import { isRowCrop } from './vegRows'
import type { ObjectKind, Plant, Planting, Project, Shape, SunLevel } from './schema'

/**
 * Planting warnings, computed from the design (never stored). Overlaps are checked at the size the
 * plants are drawn: mature by default, or in a year of the growth view (M13). Kinds: plant overlap,
 * outside the plot, soil, sun mismatch (M12) and a plant growing over a structure or paving
 * (STRUCTURE_OVERLAP_KINDS: buildings, hard paving, walls, fences, gates).
 */

export type Warning =
  /** Two plants overlap by more than the threshold at the size they're drawn. */
  | { kind: 'overlap'; plantingId: string; otherId: string; fraction: number }
  /** The plant's canopy reaches into a structure or paving by more than the threshold. */
  | { kind: 'overlap-object'; plantingId: string; objectId: string; fraction: number }
  /** The plant's centre lies outside the plot boundary. */
  | { kind: 'outside-plot'; plantingId: string }
  /** The plant doesn't suit the design's soil, or the soil (sand) is too dry for it. */
  | { kind: 'soil'; plantingId: string; suitability: 'dry' | 'unsuited' }
  /**
   * The plant's canopy stands mostly in a sun level it doesn't accept, on the sun-hours map (M12).
   * `far`: two steps off (a full-sun plant in shade, or the reverse).
   */
  | { kind: 'sun'; plantingId: string; level: SunLevel; far: boolean }

export type WarningKind = Warning['kind']

/**
 * `warning`: something is wrong (overlap, outside the plot, wrong soil). `notice`: worth knowing,
 * but often fine (a plant that needs watering on sand).
 */
export type Severity = 'warning' | 'notice'

export function warningSeverity(warning: Warning): Severity {
  if (warning.kind === 'soil') return warning.suitability === 'dry' ? 'notice' : 'warning'
  if (warning.kind === 'sun') return warning.far ? 'warning' : 'notice'
  return 'warning'
}

/** The most serious severity among some warnings. */
export function worstSeverity(warnings: readonly Warning[]): Severity {
  return warnings.some((w) => warningSeverity(w) === 'warning') ? 'warning' : 'notice'
}

export type WarningOptions = {
  /**
   * The growth view (M13): overlaps are checked at the plants' size in this year, between the
   * plantings that are in the ground by then. Default: 'mature'.
   */
  view?: GrowthView
  /** Radius (m) each planting is checked at; default: half its spread in `view`. */
  radiusM?: (planting: Planting) => number
  /** The latest sun-hours map (M12); without one there are no sun warnings. */
  sunMap?: SunMapLike | null
}

export type SunMapLike = Pick<SunHoursResult, 'grid' | 'hours'>

const SUN_RANK: Record<SunLevel, number> = { 'full-sun': 0, 'part-shade': 1, shade: 2 }

/** True when `level` is two steps from every level the plant accepts. */
function farFromSun(plant: Pick<Plant, 'sun'>, level: SunLevel): boolean {
  return plant.sun.every((accepted) => Math.abs(SUN_RANK[accepted] - SUN_RANK[level]) >= 2)
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
/**
 * How far a circle reaches into a shape, as a fraction of its diameter (0 = touching or clear,
 * 0.5 = centre on the edge, 1 = fully inside). A line counts with its thickness.
 */
export function structureOverlapFraction(circle: Omit<Circle, 'id'>, shape: Shape): number {
  const c = { x: circle.x, y: circle.y }
  let sd: number
  switch (shape.type) {
    case 'polygon': {
      const d = distanceToPolyline(c, shape.points, true)
      sd = pointInPolygon(c, shape.points) ? -d : d
      break
    }
    case 'polyline':
      sd = distanceToPolyline(c, shape.points) - shape.thicknessM / 2
      break
    case 'point':
      return 0
  }
  const depth = circle.r - sd
  return depth <= 0 ? 0 : Math.min(depth / (2 * circle.r), 1)
}

export function plantingWarnings(project: Project, options: WarningOptions = {}): Warning[] {
  const view = options.view ?? 'mature'
  const radiusM =
    options.radiusM ?? ((planting: Planting) => plantingRadiusAtM(project, planting, view))
  const plants = new Map<string, Plant | undefined>()
  const plantOf = (planting: Planting) => {
    if (!plants.has(planting.plantId)) {
      plants.set(planting.plantId, findPlant(project, planting.plantId))
    }
    return plants.get(planting.plantId)
  }
  const sunMap = options.sunMap ?? null
  const warnings: Warning[] = []

  // Overlaps, between the plants in the ground in the viewed year. A hedge is planted to close up,
  // so hedging plants may overlap each other.
  const categories = new Map<string, Plant['category'] | undefined>()
  const circles = project.plantings
    .filter((planting) => isPlanted(planting.plantedYear, view))
    .map((planting) => {
      categories.set(planting.id, plantOf(planting)?.category)
      const { x, y } = planting.position
      return { id: planting.id, x, y, r: radiusM(planting) }
    })
  const rowBeds = new Map(project.plantings.map((p) => [p.id, isRowCrop(project, p)]))
  const bothHedges = (a: Circle, b: Circle) =>
    (categories.get(a.id) === 'hedge' && categories.get(b.id) === 'hedge') ||
    (rowBeds.get(a.id) !== undefined && rowBeds.get(a.id) === rowBeds.get(b.id))
  const order = new Map(project.plantings.map((p, i) => [p.id, i]))
  const existing = new Set(
    project.plantings.filter((p) => p.status === 'existing').map((p) => p.id),
  )
  for (const { a, b, fraction } of findOverlaps(
    circles,
    project.settings.overlapThreshold,
    bothHedges,
  )) {
    // Two plants that are both already there (e.g. the neighbour's trees) are no concern.
    if (existing.has(a.id) && existing.has(b.id)) continue
    // Report each pair in design order, so the result doesn't depend on the sweep.
    const [first, second] = order.get(a.id)! < order.get(b.id)! ? [a, b] : [b, a]
    warnings.push({ kind: 'overlap', plantingId: first.id, otherId: second.id, fraction })
  }

  // Plants growing over buildings, paving and boundaries. Climbers are planted against them.
  const candidates = project.objects
    .filter(
      (o) =>
        STRUCTURE_OVERLAP_KINDS.has(o.kind) &&
        (o.shape.type === 'polygon' || o.shape.type === 'polyline'),
    )
    .map((object) => ({ object, bounds: objectBounds(object) }))
  if (candidates.length > 0) {
    const threshold = project.settings.overlapThreshold
    for (const circle of circles) {
      if (categories.get(circle.id) === 'climber') continue
      for (const { object, bounds } of candidates) {
        if (
          circle.x + circle.r < bounds.minX ||
          circle.x - circle.r > bounds.maxX ||
          circle.y + circle.r < bounds.minY ||
          circle.y - circle.r > bounds.maxY
        ) {
          continue
        }
        if (existing.has(circle.id) && object.status === 'existing') continue
        const fraction = structureOverlapFraction(circle, object.shape)
        if (fraction > threshold) {
          warnings.push({
            kind: 'overlap-object',
            plantingId: circle.id,
            objectId: object.id,
            fraction,
          })
        }
      }
    }
  }

  const plot = hasPlot(project) ? project.plot.outline : null
  const soil = project.settings.soil
  for (const planting of project.plantings) {
    // Something already there may be anywhere (the neighbour's tree) and evidently grows there.
    if (existing.has(planting.id)) continue
    if (plot && !pointInPolygon(planting.position, plot)) {
      warnings.push({ kind: 'outside-plot', plantingId: planting.id })
    }
    const plant = plantOf(planting)
    const suitability = plant ? soilSuitability(plant, soil) : 'suited'
    if (suitability !== 'suited') {
      warnings.push({ kind: 'soil', plantingId: planting.id, suitability })
    }
    if (sunMap && plant && isPlanted(planting.plantedYear, view)) {
      const size = plantSizeAt(plant, planting.plantedYear, view)
      // The ground map includes a tall plant's own shade, so it would always look shaded.
      const castsShade =
        (SHADOW_PLANT_CATEGORIES as readonly string[]).includes(plant.category) &&
        size.heightM >= MIN_SHADOW_PLANT_HEIGHT_M
      if (!castsShade) {
        const level = dominantSunLevel(
          sunMap,
          planting.position,
          size.spreadM / 2,
          project.settings.sunThresholds,
        )
        if (level && !plant.sun.includes(level)) {
          warnings.push({
            kind: 'sun',
            plantingId: planting.id,
            level,
            far: farFromSun(plant, level),
          })
        }
      }
    }
  }

  return warnings.sort((a, b) => order.get(a.plantingId)! - order.get(b.plantingId)!)
}

const cache = new WeakMap<
  Project,
  Map<GrowthView, { sunMap: SunMapLike | null; warnings: Warning[] }>
>()

/**
 * plantingWarnings for a growth view (default: mature) and sun map, remembered per project
 * version (projects are never changed in place) and view, so the plan and the warnings list share
 * the work. A different map object recomputes.
 */
export function designWarnings(
  project: Project,
  view: GrowthView = 'mature',
  sunMap: SunMapLike | null = null,
): Warning[] {
  let perView = cache.get(project)
  if (!perView) {
    perView = new Map()
    cache.set(project, perView)
  }
  let entry = perView.get(view)
  if (!entry || entry.sunMap !== sunMap) {
    entry = { sunMap, warnings: plantingWarnings(project, { view, sunMap }) }
    perView.set(view, entry)
  }
  return entry.warnings
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
  /** Structure overlaps: the kind of structure. */
  objectKind?: ObjectKind
  /** Sun warnings: the level the plants stand in. */
  level?: SunLevel
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
    let objectKind: ObjectKind | undefined
    const ids = [warning.plantingId]
    if (warning.kind === 'overlap') {
      const otherPlantId = plantIdOf.get(warning.otherId) ?? ''
      plantIds = plantId === otherPlantId ? [plantId] : [plantId, otherPlantId].sort()
      key = `overlap:${plantIds.join('|')}`
      ids.push(warning.otherId)
    } else if (warning.kind === 'overlap-object') {
      const object = project.objects.find((o) => o.id === warning.objectId)
      if (!object) continue
      objectKind = object.kind
      plantIds = [plantId]
      key = `overlap-object:${object.kind}:${plantId}`
    } else {
      plantIds = [plantId]
      key =
        warning.kind === 'sun' ? `sun:${warning.level}:${plantId}` : `${warning.kind}:${plantId}`
    }
    let group = groups.get(key)
    if (!group) {
      group = {
        key,
        kind: warning.kind,
        plantIds,
        ...(warning.kind === 'soil' ? { suitability: warning.suitability } : {}),
        ...(objectKind ? { objectKind } : {}),
        ...(warning.kind === 'sun' ? { level: warning.level } : {}),
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
