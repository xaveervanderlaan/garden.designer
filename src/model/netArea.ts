import { polygonArea } from '../geometry/polygon'
import { differenceArea } from '../geometry/clip'
import { objectBand } from './drawOrder'
import { DRAW_BANDS } from './objectKinds'
import type { GardenObject, ObjectKind, Point, Project } from './schema'

/** Open roofs: what lies under them still counts as open ground. */
export const OPEN_ROOF_KINDS: readonly ObjectKind[] = ['pergola', 'carport']

const drawOrder = (project: Project, object: GardenObject): [number, number] => [
  DRAW_BANDS.indexOf(objectBand(object)),
  project.objects.indexOf(object),
]

/**
 * The polygon objects drawn on top of `object`: in a higher band, or in the same band later in
 * `project.objects`. Open roofs, lines and symbols are left out.
 */
export function objectsOnTop(project: Project, object: GardenObject): GardenObject[] {
  const [band, index] = drawOrder(project, object)
  return project.objects.filter((o) => {
    if (o === object || o.shape.type !== 'polygon' || OPEN_ROOF_KINDS.includes(o.kind)) return false
    const [b, i] = drawOrder(project, o)
    return b > band || (b === band && i > index)
  })
}

/**
 * Gross and net area of a surface (a polygon in the surface band, incl. ponds): net = gross minus
 * the polygons drawn on top of it. Null for anything else.
 */
export function surfaceAreas(
  project: Project,
  id: string,
): { grossM2: number; netM2: number } | null {
  const object = project.objects.find((o) => o.id === id)
  if (!object || object.shape.type !== 'polygon') return null
  if (objectBand(object) !== 'surface') return null
  const points = object.shape.points
  const clips = objectsOnTop(project, object).map((o) => (o.shape as { points: Point[] }).points)
  return { grossM2: polygonArea(points), netM2: differenceArea(points, clips) }
}
