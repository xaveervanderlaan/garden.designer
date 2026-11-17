import { defaultBrief } from '../model/brief'
import { newProject } from '../model/defaults'
import type { GardenObject, ObjectKind, Planting, Point, Project } from '../model/schema'

/** A 20 × 15 m plot with north up and nothing in it, for proposal tests. */
export function emptyPlot(): Project {
  const project = newProject('Test', 1_700_000_000_000)
  project.plot.outline = [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 15 },
    { x: 0, y: 15 },
  ]
  project.brief = defaultBrief()
  return project
}

export const rectPoints = (x: number, y: number, w: number, d: number): Point[] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + d },
  { x, y: y + d },
]

export function polygonObject(id: string, kind: ObjectKind, points: Point[]): GardenObject {
  return { id, kind, shape: { type: 'polygon', points }, layer: 'existing', status: 'new' }
}

export function lineObject(id: string, kind: ObjectKind, points: Point[]): GardenObject {
  return {
    id,
    kind,
    shape: { type: 'polyline', points, thicknessM: 0.1 },
    layer: 'existing',
    status: 'new',
  }
}

export function planting(id: string, plantId: string, x: number, y: number): Planting {
  return { id, plantId, position: { x, y }, plantedYear: 2020 }
}
