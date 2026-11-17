import { distance, distanceToPolyline, pointInPolygon } from '../geometry/polygon'
import { MUST_HAVE_UNITS } from '../model/brief'
import { objectArea } from '../model/areas'
import { findPlant } from '../model/plants'
import { cornerLabel } from '../model/plot'
import type { Brief, MustHaveKind, ObjectKind, Point, Project } from '../model/schema'
import { designArea } from './expand'

export type ChecklistStatus = 'met' | 'partly' | 'missing'

export type ChecklistItem = {
  id: string
  type: 'mustHave' | 'screening' | 'include' | 'avoid' | 'toxic'
  /** Must-have kind, edge name "A–B" or plant id. */
  subject: string
  status: ChecklistStatus
  found?: number
  wanted?: number
  unit?: 'm2' | 'count'
  place?: 'met' | 'missed' | 'unchecked'
  coverage?: number
}

export const SCREEN_DISTANCE_M = 1.5
export const NEAR_HOUSE_M = 3
export const FRUIT_TREE_MIN_HEIGHT_M = 2
const SAMPLE_M = 0.25

type Side = 'N' | 'E' | 'S' | 'W'

const SIDE_WORDS: [RegExp, Side][] = [
  [/\b(north|noord)/i, 'N'],
  [/\b(east|oost)/i, 'E'],
  [/\b(south|zuid)/i, 'S'],
  [/\b(west)/i, 'W'],
]
const HOUSE_WORDS = /\b(house|huis|back door|achterdeur)/i

/** What a place text says that can be checked; null when it says nothing recognisable. */
export function placeHint(text: string): { side?: Side; nearHouse?: true } | null {
  const hint: { side?: Side; nearHouse?: true } = {}
  for (const [pattern, side] of SIDE_WORDS) {
    if (pattern.test(text)) {
      hint.side = side
      break
    }
  }
  if (HOUSE_WORDS.test(text)) hint.nearHouse = true
  return hint.side || hint.nearHouse ? hint : null
}

const BEARING: Record<Side, number> = { N: 0, E: 90, S: 180, W: 270 }

type Spot = { at: Point; weight: number }

function centroid(points: readonly Point[]): Point {
  let a = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!
    const q = points[(i + 1) % points.length]!
    const cross = p.x * q.y - q.x * p.y
    a += cross
    cx += (p.x + q.x) * cross
    cy += (p.y + q.y) * cross
  }
  if (Math.abs(a) < 1e-9) {
    const n = Math.max(points.length, 1)
    return {
      x: points.reduce((s, p) => s + p.x, 0) / n,
      y: points.reduce((s, p) => s + p.y, 0) / n,
    }
  }
  return { x: cx / (3 * a), y: cy / (3 * a) }
}

const KIND_OF: Partial<Record<MustHaveKind, ObjectKind[]>> = {
  terrace: ['terrace'],
  lawn: ['lawn'],
  pond: ['pond'],
  shed: ['shed'],
  greenhouse: ['greenhouse'],
  paths: ['path'],
  'vegetable-beds': ['bed-vegetable', 'raised-bed'],
  'play-area': ['play'],
  compost: ['compost'],
  seating: ['furniture'],
}

/** Where the items of a must-have are, how much of it there is, and how many. */
function itemsOf(project: Project, kind: MustHaveKind) {
  const spots: Spot[] = []
  let area = 0
  let count = 0
  if (kind === 'fruit-trees') {
    for (const planting of project.plantings) {
      const plant = findPlant(project, planting.plantId)
      if (plant?.category === 'fruit' && plant.heightM >= FRUIT_TREE_MIN_HEIGHT_M) {
        count++
        spots.push({ at: planting.position, weight: 1 })
      }
    }
    return { spots, area, count }
  }
  const kinds = KIND_OF[kind] ?? []
  for (const object of project.objects) {
    if (!kinds.includes(object.kind)) continue
    count++
    if (object.shape.type === 'polygon') {
      const m2 = objectArea(project, object) ?? 0
      area += m2
      spots.push({ at: centroid(object.shape.points), weight: Math.max(m2, 0.01) })
    } else if (object.shape.type === 'point') {
      spots.push({ at: object.shape.position, weight: 1 })
    } else {
      const first = object.shape.points[0]
      if (first) spots.push({ at: first, weight: 1 })
    }
  }
  return { spots, area, count }
}

function weightedCentre(spots: readonly Spot[]): Point {
  const total = spots.reduce((s, p) => s + p.weight, 0) || 1
  return {
    x: spots.reduce((s, p) => s + p.at.x * p.weight, 0) / total,
    y: spots.reduce((s, p) => s + p.at.y * p.weight, 0) / total,
  }
}

function checkPlace(
  project: Project,
  hint: NonNullable<ReturnType<typeof placeHint>>,
  spots: readonly Spot[],
): boolean {
  const centre = weightedCentre(spots)
  if (hint.side) {
    const area = designArea(project) ?? project.plot.outline
    const origin = area.length >= 3 ? centroid(area) : centre
    const angle = ((project.settings.northAngleDeg + BEARING[hint.side]) * Math.PI) / 180
    const dir = { x: Math.sin(angle), y: -Math.cos(angle) }
    if ((centre.x - origin.x) * dir.x + (centre.y - origin.y) * dir.y <= 0) return false
  }
  if (hint.nearHouse) {
    const houses = project.objects.filter((o) => o.kind === 'house' && o.shape.type === 'polygon')
    const near = houses.some((h) => {
      const points = (h.shape as { points: Point[] }).points
      return (
        pointInPolygon(centre, points) || distanceToPolyline(centre, points, true) <= NEAR_HOUSE_M
      )
    })
    if (!near) return false
  }
  return true
}

/** The part (0–1) of plot edge `edgeIndex` that fences, walls, hedges and big plants screen. */
export function edgeCoverage(project: Project, edgeIndex: number): number {
  const outline = project.plot.outline
  const a = outline[edgeIndex]
  const b = outline[(edgeIndex + 1) % outline.length]
  if (!a || !b) return 0
  const length = distance(a, b)
  if (length === 0) return 0
  const ux = (b.x - a.x) / length
  const uy = (b.y - a.y) / length
  const intervals: [number, number][] = []
  const add = (p: Point, r: number) => {
    const along = (p.x - a.x) * ux + (p.y - a.y) * uy
    const across = Math.abs(-(p.x - a.x) * uy + (p.y - a.y) * ux)
    if (across <= SCREEN_DISTANCE_M + r) intervals.push([along - r, along + r])
  }
  for (const object of project.objects) {
    if (object.kind !== 'fence' && object.kind !== 'wall' && object.kind !== 'hedge') continue
    if (object.shape.type !== 'polyline') continue
    const pts = object.shape.points
    for (let i = 0; i + 1 < pts.length; i++) {
      const p = pts[i]!
      const q = pts[i + 1]!
      const steps = Math.max(1, Math.ceil(distance(p, q) / SAMPLE_M))
      for (let s = 0; s <= steps; s++) {
        add({ x: p.x + ((q.x - p.x) * s) / steps, y: p.y + ((q.y - p.y) * s) / steps }, SAMPLE_M)
      }
    }
  }
  for (const planting of project.plantings) {
    const plant = findPlant(project, planting.plantId)
    if (plant && ['hedge', 'shrub', 'tree'].includes(plant.category)) {
      add(planting.position, plant.spreadM / 2)
    }
  }
  intervals.sort((x, y) => x[0] - y[0])
  let covered = 0
  let end = 0
  for (const [from, to] of intervals) {
    const lo = Math.max(from, end, 0)
    const hi = Math.min(to, length)
    if (hi > lo) {
      covered += hi - lo
      end = hi
    } else if (to > end) end = Math.max(end, Math.min(to, length))
  }
  return Math.min(1, covered / length)
}

const MET_COVERAGE = 0.7
const PARTLY_COVERAGE = 0.3

/** The brief checked against a design (base plus proposal): must-haves, screening, plants. */
export function briefChecklist(project: Project, brief: Brief): ChecklistItem[] {
  const items: ChecklistItem[] = []
  for (const must of brief.mustHaves) {
    const unit = MUST_HAVE_UNITS[must.kind]
    const { spots, area, count } = itemsOf(project, must.kind)
    const found = unit === 'm2' ? area : count
    const item: ChecklistItem = {
      id: must.id,
      type: 'mustHave',
      subject: must.kind,
      status: 'missing',
      found: Math.round(found * 10) / 10,
      unit,
    }
    if (must.size !== undefined) item.wanted = must.size
    if (count > 0) {
      const enough = must.size === undefined || found >= must.size
      item.status = enough ? 'met' : 'partly'
      if (must.place?.trim()) {
        const hint = placeHint(must.place)
        if (!hint) item.place = 'unchecked'
        else if (checkPlace(project, hint, spots)) item.place = 'met'
        else {
          item.place = 'missed'
          item.status = 'partly'
        }
      }
    }
    items.push(item)
  }
  const outline = project.plot.outline
  for (const index of brief.screening) {
    if (index >= outline.length) continue
    const coverage = edgeCoverage(project, index)
    items.push({
      id: `screen-${index}`,
      type: 'screening',
      subject: `${cornerLabel(index)}–${cornerLabel((index + 1) % outline.length)}`,
      status: coverage >= MET_COVERAGE ? 'met' : coverage >= PARTLY_COVERAGE ? 'partly' : 'missing',
      coverage,
    })
  }
  const planted = new Set(project.plantings.map((p) => p.plantId))
  for (const id of brief.includePlants) {
    items.push({
      id: `include-${id}`,
      type: 'include',
      subject: id,
      status: planted.has(id) ? 'met' : 'missing',
    })
  }
  for (const id of brief.avoidPlants) {
    items.push({
      id: `avoid-${id}`,
      type: 'avoid',
      subject: id,
      status: planted.has(id) ? 'missing' : 'met',
    })
  }
  if (brief.avoidToxic) {
    const toxic = project.plantings.filter((p) => findPlant(project, p.plantId)?.toxic).length
    items.push({
      id: 'toxic',
      type: 'toxic',
      subject: 'toxic',
      status: toxic > 0 ? 'missing' : 'met',
      found: toxic,
      unit: 'count',
    })
  }
  return items
}
