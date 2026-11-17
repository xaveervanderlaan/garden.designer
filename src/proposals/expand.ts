import polygonClipping, { type Polygon } from 'polygon-clipping'
import { longestEdgeAngle } from '../geometry/planting'
import {
  nearestPointOnSegment,
  pointInPolygon,
  polygonArea,
  segmentsIntersect,
} from '../geometry/polygon'
import { bedAt, findBed, relinkBeds } from '../model/beds'
import { baseRefs } from '../model/brief'
import { updateObject, deleteItems } from '../model/edit'
import { hasHeight, type MaterialId, type SymbolVariantId } from '../model/objectKinds'
import { addObject, setHedgePlant, setObjectMaterial, shapeForKind } from '../model/objects'
import { addPlantings, fillBedPositions } from '../model/plantings'
import { allPlants, findPlant, plantRadiusM, plantingRadiusM } from '../model/plants'
import type { ObjectKind, Plant, Point, Project, Shape } from '../model/schema'
import { bedFill, setBedRowAngle } from '../model/vegRows'
import { overlapFraction } from '../model/warnings'
import type { Proposal, ProposalElement } from './format'
import { resolvePlant } from './plantMatch'

/**
 * Turns a proposal into a design: the base plus the proposal's items, all marked new. Pure and
 * deterministic (apart from the new ids). Items are clipped to the design area (plot ∩ brief area),
 * plants that would overlap are dropped, and unknown plant ids are matched on the Latin name.
 * Everything that was left out is listed in the report.
 */

export type DropReason =
  'outside' | 'overlap' | 'unknownPlant' | 'fixed' | 'unknownRef' | 'tooSmall'

export type ExpansionReport = {
  /** Objects, beds and hedges added. */
  objects: number
  plantings: number
  /** Distinct species among the added plantings. */
  species: number
  dropped: { what: 'object' | 'plant' | 'remove'; reason: DropReason; name?: string }[]
  /** Plant ids that were not exact, and the id they were matched to. */
  matched: { given: string; id: string }[]
}

/** Line and point vertices up to this far outside the area are moved onto its edge. */
export const SNAP_INSIDE_M = 0.5
/** Clipped polygons smaller than this (m²) are dropped. */
export const MIN_POLYGON_AREA_M2 = 0.1
/** Rings of hexagonal spots tried around a group's centre. */
const GROUP_RINGS = 10

type ElementOf<T extends ProposalElement['type']> = Extract<ProposalElement, { type: T }>

/** A rect's corners, turned `rot` degrees clockwise on the plan (y points down) about its centre. */
export function rectCorners(rect: {
  c: readonly [number, number]
  w: number
  d: number
  rot?: number | undefined
}): Point[] {
  const a = ((rect.rot ?? 0) * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const [cx, cy] = rect.c
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sx, sy]) => {
    const x = (sx! * rect.w) / 2
    const y = (sy! * rect.d) / 2
    return { x: cx + x * cos - y * sin, y: cy + x * sin + y * cos }
  })
}

const toPoint = ([x, y]: readonly [number, number]): Point => ({ x, y })
const ring = (points: readonly Point[]): Polygon => [
  points.map((p): [number, number] => [p.x, p.y]),
]

/** Outer ring of the largest piece of a polygon-clipping result (open ring). */
function largestPiece(pieces: [number, number][][][]): Point[] | null {
  let best: Point[] | null = null
  let bestArea = 0
  for (const piece of pieces) {
    const outer = piece[0]
    if (!outer) continue
    const points = outer.slice(0, -1).map(([x, y]) => ({ x, y }))
    const area = polygonArea(points)
    if (area > bestArea) {
      best = points
      bestArea = area
    }
  }
  return best
}

function crossesEdge(points: readonly Point[], area: readonly Point[]): boolean {
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!
    const b = points[(i + 1) % points.length]!
    for (let j = 0; j < area.length; j++) {
      if (segmentsIntersect(a, b, area[j]!, area[(j + 1) % area.length]!)) return true
    }
  }
  return false
}

type Clipped = { points: Point[] } | { reason: 'outside' | 'tooSmall' }

/** A polygon cut to the area (largest piece); unchanged when it lies inside. */
export function clipPolygon(points: readonly Point[], area: readonly Point[] | null): Clipped {
  let result: Point[] | null = [...points]
  if (area && (!points.every((p) => pointInPolygon(p, area)) || crossesEdge(points, area))) {
    try {
      result = largestPiece(polygonClipping.intersection(ring(points), ring(area)))
    } catch {
      result = null
    }
    if (!result) return { reason: 'outside' }
  }
  return polygonArea(result) < MIN_POLYGON_AREA_M2 ? { reason: 'tooSmall' } : { points: result }
}

/** Vertices inside the area stay; those within SNAP_INSIDE_M move onto its edge; else null. */
export function clipVertices(
  points: readonly Point[],
  area: readonly Point[] | null,
): Point[] | null {
  if (!area) return [...points]
  const result: Point[] = []
  for (const p of points) {
    if (pointInPolygon(p, area)) {
      result.push(p)
      continue
    }
    let nearest: { point: Point; distance: number } | null = null
    for (let i = 0; i < area.length; i++) {
      const hit = nearestPointOnSegment(p, area[i]!, area[(i + 1) % area.length]!)
      if (!nearest || hit.distance < nearest.distance) nearest = hit
    }
    if (!nearest || nearest.distance > SNAP_INSIDE_M) return null
    result.push(nearest.point)
  }
  return result
}

/** The plot cut to the brief's design area (largest piece); null when there is nothing to clip to. */
export function designArea(project: Project): Point[] | null {
  const plot = project.plot.outline.length >= 3 ? project.plot.outline : null
  const area = project.brief?.area ?? null
  if (!plot || !area) return plot ?? area
  try {
    return largestPiece(polygonClipping.intersection(ring(plot), ring(area))) ?? []
  } catch {
    return plot
  }
}

type Circle = { x: number; y: number; r: number; hedge: boolean }

/** Hexagonal spots `spacing` apart around `centre`, nearest first (then by angle). */
export function hexSpots(centre: Point, spacing: number, rings = GROUP_RINGS): Point[] {
  const spots: { p: Point; d: number; a: number }[] = []
  const h = (spacing * Math.sqrt(3)) / 2
  for (let j = -rings; j <= rings; j++) {
    for (let i = -rings; i <= rings; i++) {
      const dx = i * spacing + (j * spacing) / 2
      const dy = j * h
      const a = Math.atan2(dy, dx)
      spots.push({
        p: { x: centre.x + dx, y: centre.y + dy },
        d: Math.round(Math.hypot(dx, dy) * 1e6),
        a: Math.round((a < 0 ? a + 2 * Math.PI : a) * 1e6),
      })
    }
  }
  return spots.sort((s, t) => s.d - t.d || s.a - t.a).map((s) => s.p)
}

/** Splits n items by shares, largest remainder first (ties to the earlier share). */
export function splitByShares(n: number, shares: readonly number[]): number[] {
  const total = shares.reduce((sum, s) => sum + s, 0)
  const quotas = shares.map((s) => (n * s) / total)
  const counts = quotas.map(Math.floor)
  const order = quotas
    .map((q, i) => ({ i, rest: q - Math.floor(q) }))
    .sort((a, b) => b.rest - a.rest || a.i - b.i)
  let left = n - counts.reduce((sum, c) => sum + c, 0)
  for (const { i } of order) {
    if (left <= 0) break
    counts[i]! += 1
    left--
  }
  return counts
}

export function expandProposal(
  base: Project,
  proposal: Proposal,
  options: { year: number },
): { project: Project; report: ExpansionReport } {
  const { year } = options
  const plants = allPlants(base)
  const area = designArea(base)
  const threshold = base.settings.overlapThreshold
  const report: ExpansionReport = {
    objects: 0,
    plantings: 0,
    species: 0,
    dropped: [],
    matched: [],
  }
  const resolved = new Map<string, Plant | null>()
  const resolve = (given: string): Plant | null => {
    if (!resolved.has(given)) {
      const id = resolvePlant(plants, given)
      if (id !== null && id !== given) report.matched.push({ given, id })
      resolved.set(given, id === null ? null : (plants.find((p) => p.id === id) ?? null))
    }
    const plant = resolved.get(given) ?? null
    if (!plant) report.dropped.push({ what: 'plant', reason: 'unknownPlant', name: given })
    return plant
  }
  const drop = (what: 'object' | 'plant' | 'remove', reason: DropReason, name?: string) =>
    report.dropped.push(name === undefined ? { what, reason } : { what, reason, name })
  const of = <T extends ProposalElement['type']>(type: T) =>
    proposal.elements.filter((e): e is ElementOf<T> => e.type === type)

  // Removes: only items the brief marks as "may change".
  const refs = baseRefs(base)
  const mayChange = new Set(base.brief?.mayChange ?? [])
  const removeIds = new Set<string>()
  for (const el of of('remove')) {
    const id = refs.objects.get(el.ref) ?? refs.plantings.get(el.ref)
    if (id === undefined) drop('remove', 'unknownRef', el.ref)
    else if (!mayChange.has(id)) drop('remove', 'fixed', el.ref)
    else removeIds.add(id)
  }
  let project = removeIds.size ? deleteItems(base, removeIds) : base

  const add = (
    kind: ObjectKind,
    points: Point[],
    extra: { thicknessM?: number | undefined; rot?: number | undefined; variant?: string },
  ): string | null => {
    let shape: Shape | null = shapeForKind(kind, points)
    if (!shape) return null
    if (shape.type === 'polyline' && extra.thicknessM !== undefined) {
      shape = { ...shape, thicknessM: extra.thicknessM }
    }
    if (shape.type === 'point' && extra.rot !== undefined) {
      shape = { ...shape, rotationDeg: ((extra.rot % 360) + 360) % 360 }
    }
    const added = addObject(project, kind, shape, {
      status: 'new',
      ...(extra.variant === undefined ? {} : { variant: extra.variant as SymbolVariantId }),
    })
    project = added.project
    report.objects++
    return added.id
  }
  const outlineOf = (el: {
    rect?: { c: [number, number]; w: number; d: number; rot?: number | undefined } | undefined
    polygon?: [number, number][] | undefined
  }): Point[] => (el.rect ? rectCorners(el.rect) : (el.polygon ?? []).map(toPoint))
  const setFields = (
    id: string,
    kind: ObjectKind,
    el: { heightM?: number | undefined; label?: string | undefined },
  ) => {
    if (el.heightM !== undefined && hasHeight(kind)) {
      project = updateObject(project, id, { heightM: el.heightM })
    }
    if (el.label !== undefined && el.label.trim()) {
      project = updateObject(project, id, { label: el.label.trim() })
    }
  }

  // Objects.
  for (const el of of('object')) {
    let points: Point[] | null
    if (el.rect || el.polygon) {
      const clipped = clipPolygon(outlineOf(el), area)
      if ('reason' in clipped) {
        drop('object', clipped.reason, el.kind)
        continue
      }
      points = clipped.points
    } else {
      points = clipVertices(el.line ? el.line.map(toPoint) : el.at ? [toPoint(el.at)] : [], area)
    }
    if (!points) {
      drop('object', 'outside', el.kind)
      continue
    }
    const id = add(el.kind, points, {
      thicknessM: el.thicknessM,
      rot: el.rot,
      ...(el.variant === undefined ? {} : { variant: el.variant }),
    })
    if (id === null) continue
    if (el.material !== undefined) {
      project = setObjectMaterial(project, id, el.material as MaterialId)
    }
    setFields(id, el.kind, el)
  }

  // Beds.
  const beds: { id: string; el: ElementOf<'bed'> }[] = []
  for (const el of of('bed')) {
    const clipped = clipPolygon(outlineOf(el), area)
    if ('reason' in clipped) {
      drop('object', clipped.reason, el.kind)
      continue
    }
    const id = add(el.kind, clipped.points, {})
    if (id === null) continue
    if (el.rowAngleDeg !== undefined) project = setBedRowAngle(project, id, el.rowAngleDeg)
    setFields(id, el.kind, el)
    beds.push({ id, el })
  }

  // Hedges.
  for (const el of of('hedge')) {
    const points = clipVertices(el.line.map(toPoint), area)
    if (!points) {
      drop('object', 'outside', 'hedge')
      continue
    }
    const id = add('hedge', points, { thicknessM: el.thicknessM })
    if (id === null) continue
    setFields(id, 'hedge', el)
    const plant = resolve(el.plant)
    if (plant && plant.category !== 'hedge') {
      drop('plant', 'unknownPlant', el.plant)
    } else if (plant) {
      project = setHedgePlant(project, id, plant.id)
    }
  }

  // Specimens and groups, checked for overlaps against everything placed so far.
  const circles: Circle[] = project.plantings.map((p) => ({
    x: p.position.x,
    y: p.position.y,
    r: plantingRadiusM(project, p),
    hedge: findPlant(project, p.plantId)?.category === 'hedge',
  }))
  const circleOf = (plant: Plant, p: Point): Circle => ({
    x: p.x,
    y: p.y,
    r: plantRadiusM(plant),
    hedge: plant.category === 'hedge',
  })
  const fits = (plant: Plant, p: Point) => {
    const circle = circleOf(plant, p)
    return !circles.some(
      (other) => !(circle.hedge && other.hedge) && overlapFraction(circle, other) > threshold,
    )
  }
  /** Adds plantings; `tracked` = their circles are already in `circles`. */
  const place = (plant: Plant, positions: readonly Point[], tracked = false) => {
    if (positions.length === 0) return
    project = addPlantings(project, plant.id, positions, year).project
    if (!tracked) circles.push(...positions.map((p) => circleOf(plant, p)))
  }
  const inArea = (p: Point) => !area || pointInPolygon(p, area)

  for (const el of of('plant')) {
    const plant = resolve(el.plant)
    if (!plant) continue
    const at = toPoint(el.at)
    if (!inArea(at)) drop('plant', 'outside', plant.id)
    else if (!fits(plant, at)) drop('plant', 'overlap', plant.id)
    else place(plant, [at])
  }

  for (const el of of('group')) {
    const plant = resolve(el.plant)
    if (!plant) continue
    const centre = toPoint(el.at)
    if (!inArea(centre)) {
      drop('plant', 'outside', plant.id)
      continue
    }
    const container = bedAt(project, centre)?.shape.points ?? area
    const spots: Point[] = []
    for (const spot of hexSpots(centre, plant.spreadM)) {
      if (spots.length >= el.count) break
      if (container && !pointInPolygon(spot, container)) continue
      if (!inArea(spot) || !fits(plant, spot)) continue
      spots.push(spot)
      circles.push(circleOf(plant, spot))
    }
    if (spots.length === 0) drop('plant', 'overlap', plant.id)
    place(plant, spots, true)
  }

  // Bed mixes: one staggered fill, split into runs along the bed by share.
  for (const { id, el } of beds) {
    if (!el.mix?.length) continue
    const mix = el.mix.flatMap((m) => {
      const plant = resolve(m.plant)
      return plant ? [{ plant, share: m.share }] : []
    })
    if (mix.length === 0 || !findBed(project, id)) continue
    const total = mix.reduce((sum, m) => sum + m.share, 0)
    const spacing = mix.reduce((sum, m) => sum + m.share * m.plant.spreadM, 0) / total
    const positions = fillBedPositions(project, id, mix[0]!.plant.id, spacing).positions
    const angle = longestEdgeAngle(findBed(project, id)!.shape.points)
    const along = { x: Math.cos(angle), y: Math.sin(angle) }
    const key = (p: Point) => Math.round((p.x * along.x + p.y * along.y) * 1e6)
    const across = (p: Point) => Math.round((p.y * along.x - p.x * along.y) * 1e6)
    const sorted = [...positions].sort((a, b) => key(a) - key(b) || across(a) - across(b))
    const counts = splitByShares(
      sorted.length,
      mix.map((m) => m.share),
    )
    let start = 0
    mix.forEach((m, i) => {
      place(m.plant, sorted.slice(start, start + counts[i]!))
      start += counts[i]!
    })
  }

  // Crops: rows in order, packed after the ones before.
  for (const { id, el } of beds) {
    for (const crop of el.crops ?? []) {
      const plant = resolve(crop.plant)
      if (!plant) continue
      const fill = bedFill(project, {
        bedId: id,
        plantId: plant.id,
        spacingM: plant.veg?.inRowSpacingM ?? plant.spreadM,
        ...(plant.veg ? { rowSpacingM: plant.veg.rowSpacingM } : {}),
        ...(crop.rows === undefined ? {} : { rows: crop.rows }),
      })
      place(plant, fill.positions)
    }
  }

  project = relinkBeds(project)
  const baseIds = new Set(base.plantings.map((p) => p.id))
  const added = project.plantings.filter((p) => !baseIds.has(p.id))
  report.plantings = added.length
  report.species = new Set(added.map((p) => p.plantId)).size
  return { project, report }
}
