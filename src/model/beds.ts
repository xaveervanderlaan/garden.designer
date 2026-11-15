import { insertCorner, moveCorner, removeCorner, setEdgeLength } from '../geometry/outline'
import { pointInPolygon, roundPoint } from '../geometry/polygon'
import { newId } from './ids'
import type { GardenObject, LayerId, ObjectKind, Planting, Point, Project } from './schema'

/** Planting beds: polygons of kind ornamental or vegetable bed. Plantings inside link to them. */

export const BED_KINDS = ['bed-ornamental', 'bed-vegetable'] as const satisfies ObjectKind[]
export type BedKind = (typeof BED_KINDS)[number]

export type Bed = GardenObject & {
  kind: BedKind
  shape: { type: 'polygon'; points: Point[] }
}

export function isBedKind(kind: ObjectKind): kind is BedKind {
  return (BED_KINDS as readonly ObjectKind[]).includes(kind)
}

export function isBed(object: GardenObject): object is Bed {
  return isBedKind(object.kind) && object.shape.type === 'polygon'
}

/** Ornamental beds are on "beds & plants"; vegetable beds on "vegetables". */
export function bedLayer(kind: BedKind): LayerId {
  return kind === 'bed-vegetable' ? 'vegetables' : 'plants'
}

export function bedsOf(project: Project): Bed[] {
  return project.objects.filter(isBed)
}

export function findBed(project: Project, id: string): Bed | undefined {
  const object = project.objects.find((o) => o.id === id)
  return object && isBed(object) ? object : undefined
}

/** Number of a bed among the beds of its kind (1, 2, …), for a default name. */
export function bedNumber(project: Project, bed: Bed): number {
  return (
    bedsOf(project)
      .filter((b) => b.kind === bed.kind)
      .findIndex((b) => b.id === bed.id) + 1
  )
}

/** The bed a point lies in: the topmost (last drawn) one when beds overlap. */
export function bedAt(project: Project, point: Point): Bed | undefined {
  const beds = bedsOf(project)
  for (let i = beds.length - 1; i >= 0; i--) {
    const bed = beds[i]!
    if (pointInPolygon(point, bed.shape.points)) return bed
  }
  return undefined
}

function withBed(planting: Planting, bedId: string | undefined): Planting {
  if (planting.bedId === bedId) return planting
  if (bedId) return { ...planting, bedId }
  const { bedId: _, ...rest } = planting
  return rest
}

/**
 * Links every planting (or just `ids`) to the bed that contains it, or to none. Returns the same
 * project when nothing changes. Called after anything that moves plants or changes beds.
 */
export function relinkBeds(project: Project, ids?: ReadonlySet<string>): Project {
  const beds = bedsOf(project)
  let changed = false
  const plantings = project.plantings.map((planting) => {
    if (ids && !ids.has(planting.id)) return planting
    let bedId: string | undefined
    for (let i = beds.length - 1; i >= 0; i--) {
      if (pointInPolygon(planting.position, beds[i]!.shape.points)) {
        bedId = beds[i]!.id
        break
      }
    }
    const linked = withBed(planting, bedId)
    if (linked !== planting) changed = true
    return linked
  })
  return changed ? { ...project, plantings } : project
}

/** Adds a bed (and links the plants already inside it). */
export function addBed(
  project: Project,
  kind: BedKind,
  points: readonly Point[],
): { project: Project; id: string } {
  const bed: Bed = {
    id: newId(),
    kind,
    shape: { type: 'polygon', points: points.map(roundPoint) },
    layer: bedLayer(kind),
  }
  return { project: relinkBeds({ ...project, objects: [...project.objects, bed] }), id: bed.id }
}

/** Switches a bed between ornamental and vegetable (which also moves it to that layer). */
export function setBedKind(project: Project, id: string, kind: BedKind): Project {
  const bed = findBed(project, id)
  if (!bed || bed.kind === kind) return project
  return {
    ...project,
    objects: project.objects.map((o) => (o.id === id ? { ...o, kind, layer: bedLayer(kind) } : o)),
  }
}

function withBedPoints(
  project: Project,
  id: string,
  change: (points: readonly Point[]) => readonly Point[],
): Project {
  const bed = findBed(project, id)
  if (!bed) return project
  const points = change(bed.shape.points)
  if (points === bed.shape.points) return project
  const shape = { ...bed.shape, points: points.map(roundPoint) }
  return relinkBeds({
    ...project,
    objects: project.objects.map((o) => (o.id === id ? { ...o, shape } : o)),
  })
}

export function moveBedCorner(project: Project, id: string, index: number, to: Point): Project {
  return withBedPoints(project, id, (points) => moveCorner(points, index, to))
}

export function insertBedCorner(project: Project, id: string, after: number, at: Point): Project {
  return withBedPoints(project, id, (points) => insertCorner(points, after, at))
}

/** Removes a corner; refused below 3 corners. */
export function removeBedCorner(project: Project, id: string, index: number): Project {
  return withBedPoints(project, id, (points) => removeCorner(points, index))
}

export function setBedEdgeLength(
  project: Project,
  id: string,
  index: number,
  length: number,
): Project {
  return withBedPoints(project, id, (points) => setEdgeLength(points, index, length))
}

/** The given item ids plus the plantings in any of those that are beds: they move together. */
export function withPlantsInBeds(project: Project, ids: ReadonlySet<string>): Set<string> {
  const result = new Set(ids)
  const beds = new Set(
    bedsOf(project)
      .filter((b) => ids.has(b.id))
      .map((b) => b.id),
  )
  if (beds.size === 0) return result
  for (const planting of project.plantings) {
    if (planting.bedId && beds.has(planting.bedId)) result.add(planting.id)
  }
  return result
}

export function plantingsInBed(project: Project, bedId: string): Planting[] {
  return project.plantings.filter((p) => p.bedId === bedId)
}
