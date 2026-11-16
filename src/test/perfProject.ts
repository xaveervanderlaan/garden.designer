// Only the schema, with its extension: see below.
import {
  type GardenObject,
  LAYER_IDS,
  type Layers,
  type Plant,
  type PlantCategory,
  type Planting,
  type Point,
  type Project,
  SCHEMA_VERSION,
} from '../model/schema.ts'

/**
 * A large, realistic test design for performance work (milestone M7): a plot of about 1000 m²
 * with a hedge, trees, borders, an island bed and vegetable beds, holding (by default) exactly
 * 1000 plantings of many species. Deterministic for a given seed.
 *
 * The perf e2e test (tests/e2e/perf.spec.ts) imports it in Node, so it is self-contained: it
 * imports only the schema (Node needs the `.ts` extension, and can't import the plant data's JSON
 * modules), the plants are passed in, and it does its own simple geometry. perfProject.test.ts
 * checks that the result matches the app's own rules (schema, default settings, bed links).
 * Later milestones can extend it, e.g. with hardscape (M8: a house, terrace and paths fit in the
 * open front-right corner, x 25–37, y 16–25), so the perf test covers their rendering too.
 */

export type PerfProjectOptions = {
  /** Exact number of plantings. Default 1000. */
  plantings?: number
  /** Seed for the random choices (species, patch widths, planting years). */
  seed?: number
  name?: string
}

/** The plot: 42 × 25 m with a notch at the front right, 1030 m². */
export const PERF_PLOT: readonly Point[] = [
  { x: 0, y: 0 },
  { x: 42, y: 0 },
  { x: 42, y: 21 },
  { x: 37, y: 21 },
  { x: 37, y: 25 },
  { x: 0, y: 25 },
]

const ORNAMENTAL_BEDS: readonly (readonly Point[])[] = [
  // Back border, along the hedge.
  [
    { x: 1.5, y: 1.5 },
    { x: 40, y: 1.5 },
    { x: 40, y: 4.5 },
    { x: 30, y: 5.5 },
    { x: 18, y: 4.2 },
    { x: 8, y: 5.5 },
    { x: 1.5, y: 4.5 },
  ],
  // Left border.
  [
    { x: 1.5, y: 6.5 },
    { x: 4.5, y: 6.5 },
    { x: 5, y: 15 },
    { x: 4, y: 23.5 },
    { x: 1.5, y: 23.5 },
  ],
  // Island bed in the lawn: an octagon of 10 × 5 m.
  Array.from({ length: 8 }, (_, i) => ({
    x: 18 + 5 * Math.cos((i * Math.PI) / 4),
    y: 13 + 2.5 * Math.sin((i * Math.PI) / 4),
  })),
  // Front border.
  [
    { x: 7, y: 21 },
    { x: 24, y: 21 },
    { x: 24, y: 23.5 },
    { x: 7, y: 23.5 },
  ],
]

/** Four vegetable beds of 1.2 × 6 m. */
const VEGETABLE_BEDS: readonly (readonly Point[])[] = Array.from({ length: 4 }, (_, i) => {
  const x = 29 + i * 2.2
  return [
    { x, y: 9 },
    { x: x + 1.2, y: 9 },
    { x: x + 1.2, y: 15 },
    { x, y: 15 },
  ]
})

const HEDGES: readonly (readonly [Point, Point])[] = [
  [
    { x: 0.5, y: 0.5 },
    { x: 41.5, y: 0.5 },
  ],
  [
    { x: 41.5, y: 1.5 },
    { x: 41.5, y: 20.5 },
  ],
]

const TREES: readonly Point[] = [
  { x: 9, y: 11 },
  { x: 28, y: 4 },
  { x: 33, y: 18.5 },
  { x: 12, y: 17.5 },
  { x: 24, y: 8 },
  { x: 7, y: 8 },
]

/** What a border patch is planted with, and how likely. */
const PATCH_CATEGORIES: readonly [PlantCategory, number][] = [
  ['perennial', 0.52],
  ['grass', 0.14],
  ['fern', 0.08],
  ['shrub', 0.2],
  ['bulb', 0.06],
]

/** Closer than this, plants become a carpet (bulbs, lettuce); the plan stays readable. */
const MIN_SPACING_M = 0.3

/** mulberry32: a small, fast, seeded random generator (0 ≤ x < 1). */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const round = (p: Point): Point => ({
  x: Math.round(p.x * 1e6) / 1e6 || 0,
  y: Math.round(p.y * 1e6) / 1e6 || 0,
})

/** Even-odd ray casting. */
function inside(p: Point, polygon: readonly Point[]): boolean {
  let result = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!
    const b = polygon[j]!
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      result = !result
    }
  }
  return result
}

function distanceToOutline(p: Point, polygon: readonly Point[]): number {
  let best = Infinity
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!
    const b = polygon[(i + 1) % polygon.length]!
    const dx = b.x - a.x
    const dy = b.y - a.y
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)))
    best = Math.min(best, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy))
  }
  return best
}

/** A staggered pattern `spacing` apart inside the polygon, half a spacing from its edges. */
function staggered(polygon: readonly Point[], spacing: number, keep: (p: Point) => boolean) {
  const xs = polygon.map((p) => p.x)
  const ys = polygon.map((p) => p.y)
  const [minX, maxX, minY, maxY] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ]
  const rowStep = (spacing * Math.sqrt(3)) / 2
  const points: Point[] = []
  for (let row = 0, y = minY + spacing / 2; y <= maxY; row++, y += rowStep) {
    for (let x = minX + (row % 2 ? spacing : spacing / 2); x <= maxX; x += spacing) {
      const p = { x, y }
      if (keep(p) && inside(p, polygon) && distanceToOutline(p, polygon) >= spacing / 2) {
        points.push(round(p))
      }
    }
  }
  return points
}

/** Evenly spaced points along a line, `spacing` apart. */
function along([a, b]: readonly [Point, Point], spacing: number): Point[] {
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  const count = Math.floor(length / spacing) + 1
  return Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 0.5 : i / (count - 1)
    return round({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
  })
}

type Placement = { plantId: string; position: Point }

/**
 * Everything the garden holds, with the bed planting spread out by `looseness` (1 = plants just
 * touch at full size). The species choices depend only on the seed, not on the looseness.
 */
function layout(plants: readonly Plant[], seed: number, looseness: number): Placement[] {
  const random = seededRandom(seed)
  const pool = (category: PlantCategory, maxSpread = Infinity) =>
    plants.filter((p) => p.category === category && p.spreadM <= maxSpread)
  const pick = <T>(list: readonly T[]): T => {
    if (list.length === 0) throw new Error('perfProject: no plants of a needed category')
    return list[Math.floor(random() * list.length)]!
  }
  const placements: Placement[] = []
  const place = (plant: Plant, positions: readonly Point[]) => {
    for (const position of positions) placements.push({ plantId: plant.id, position })
  }

  for (const at of TREES) place(pick(pool('tree', 10)), [at])
  for (const line of HEDGES) {
    const hedge = pick(pool('hedge'))
    place(hedge, along(line, Math.min(0.33, hedge.spreadM)))
  }

  // Borders: patches (drifts) of one species each, across the bed's long side.
  for (const bed of ORNAMENTAL_BEDS) {
    const xs = bed.map((p) => p.x)
    const ys = bed.map((p) => p.y)
    const alongX = Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys)
    const coordinate = (p: Point) => (alongX ? p.x : p.y)
    const end = Math.max(...bed.map(coordinate))
    for (let start = Math.min(...bed.map(coordinate)); start < end;) {
      const width = 1.5 + random() * 2.5
      const from = start
      const to = Math.min(end, start + width)
      start = to
      let roll = random()
      const category =
        PATCH_CATEGORIES.find(([, chance]) => (roll -= chance) < 0)?.[0] ?? 'perennial'
      const plant = pick(pool(category, Math.min(2.5, width)))
      const spacing = Math.max(plant.spreadM, MIN_SPACING_M) * looseness
      place(
        plant,
        staggered(bed, spacing, (p) => {
          const c = coordinate(p)
          return c >= from + spacing / 2 && c <= to - spacing / 2
        }),
      )
    }
  }

  for (const bed of VEGETABLE_BEDS) {
    const crop = pick(pool('vegetable', 1))
    const spacing = Math.max(crop.veg?.inRowSpacingM ?? crop.spreadM, MIN_SPACING_M) * looseness
    place(
      crop,
      staggered(bed, spacing, () => true),
    )
  }
  return placements
}

/** The test design, with exactly `plantings` plantings (default 1000). */
export function perfProject(plants: readonly Plant[], options: PerfProjectOptions = {}): Project {
  const { plantings: target = 1000, seed = 1, name = 'Performance test garden' } = options

  // Plant the beds as closely as possible while there is room for all plantings, then drop the
  // last few that are too many.
  let placements: Placement[] = []
  for (let looseness = 2; looseness >= 0.5; looseness -= 0.02) {
    placements = layout(plants, seed, looseness)
    if (placements.length >= target) break
  }
  if (placements.length < target) {
    throw new Error(`perfProject: room for only ${placements.length} of ${target} plantings`)
  }

  const random = seededRandom(seed + 1)
  const beds: GardenObject[] = [
    ...ORNAMENTAL_BEDS.map((points, i): GardenObject => ({
      id: `perf-bed-${i + 1}`,
      kind: 'bed-ornamental',
      shape: { type: 'polygon', points: points.map(round) },
      layer: 'plants',
      status: 'new',
    })),
    ...VEGETABLE_BEDS.map((points, i): GardenObject => ({
      id: `perf-vegetable-bed-${i + 1}`,
      kind: 'bed-vegetable',
      shape: { type: 'polygon', points: points.map(round) },
      layer: 'vegetables',
      status: 'new',
    })),
  ]
  const bedOf = (position: Point) =>
    beds.findLast((bed) => bed.shape.type === 'polygon' && inside(position, bed.shape.points))?.id
  const list: Planting[] = placements.slice(0, target).map((placement, i) => {
    const bedId = bedOf(placement.position)
    return {
      id: `perf-planting-${i + 1}`,
      plantId: placement.plantId,
      position: placement.position,
      ...(bedId && { bedId }),
      plantedYear: 2025 + Math.floor(random() * 3),
    }
  })

  const created = 1_800_000_000_000
  return {
    id: `perf-${seed}`,
    name,
    schemaVersion: SCHEMA_VERSION,
    createdAt: created,
    updatedAt: created,
    // The defaults of a new design (model/defaults.ts; the unit test checks they still match).
    settings: {
      location: { lat: 52.13, lng: 5.29 },
      northAngleDeg: 0,
      gridSizeM: 0.5,
      soil: 'sand',
      overlapThreshold: 0.2,
    },
    plot: { outline: PERF_PLOT.map((p) => ({ ...p })) },
    objects: beds,
    plantings: list,
    customPlants: [],
    layers: Object.fromEntries(
      LAYER_IDS.map((id) => [id, { visible: true, locked: false }]),
    ) as Layers,
  }
}
