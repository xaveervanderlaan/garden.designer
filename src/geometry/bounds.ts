import { plantingRadiusM } from '../model/plants'
import type { Point, Project, Shape } from '../model/schema'

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number }

/** What an empty design shows: a 30 × 20 m area. */
export const DEFAULT_VIEW_BOUNDS: Bounds = { minX: 0, minY: 0, maxX: 30, maxY: 20 }

/** Point-shaped objects (furniture, lights, …) are drawn with this radius until they get sizes. */
export const POINT_OBJECT_RADIUS_M = 0.3

export function boundsOfPoints(points: readonly Point[]): Bounds | null {
  if (points.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const { x, y } of points) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  return { minX, minY, maxX, maxY }
}

export function circleBounds(centre: Point, radius: number): Bounds {
  return {
    minX: centre.x - radius,
    minY: centre.y - radius,
    maxX: centre.x + radius,
    maxY: centre.y + radius,
  }
}

export function shapeBounds(shape: Shape): Bounds {
  switch (shape.type) {
    case 'polygon':
      return boundsOfPoints(shape.points)!
    case 'polyline': {
      const b = boundsOfPoints(shape.points)!
      const half = shape.thicknessM / 2
      return { minX: b.minX - half, minY: b.minY - half, maxX: b.maxX + half, maxY: b.maxY + half }
    }
    case 'point':
      return circleBounds(shape.position, POINT_OBJECT_RADIUS_M)
  }
}

export function unionBounds(a: Bounds | null, b: Bounds | null): Bounds | null {
  if (!a) return b
  if (!b) return a
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  }
}

export function boundsCentre(b: Bounds): Point {
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }
}

/** Everything in the design: plot, objects and plantings. Null for an empty design. */
export function projectBounds(project: Project): Bounds | null {
  let bounds = boundsOfPoints(project.plot.outline)
  for (const object of project.objects) bounds = unionBounds(bounds, shapeBounds(object.shape))
  for (const planting of project.plantings) {
    bounds = unionBounds(
      bounds,
      circleBounds(planting.position, plantingRadiusM(project, planting)),
    )
  }
  return bounds
}
