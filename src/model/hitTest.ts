import { shapePoints } from '../geometry/frame'
import {
  distance,
  nearestPointOnSegment,
  perimeter,
  pointInPolygon,
  polygonArea,
} from '../geometry/polygon'
import { type PlantView, plantAppearance } from '../styles/plantAppearance'
import { isTreeCanopy, objectBand } from './drawOrder'
import { isLayerVisible } from './edit'
import { DRAW_BANDS, type DrawBand, symbolRadiusM } from './objectKinds'
import { findPlant, plantingLayer } from './plants'
import { PLOT_LAYER } from './plot'
import type { GardenObject, Point, Project } from './schema'

export type HitItem = { type: 'planting' | 'object'; id: string } | { type: 'plot' }

type Candidate = { item: HitItem; footprint: number; order: number }

/** Stacking order: band first, then the position in its list (later = on top). */
const orderOf = (band: DrawBand, index: number) => DRAW_BANDS.indexOf(band) * 1e6 + index

/** Footprint (m²) of an object if `point` hits it, else null. */
function objectHit(object: GardenObject, point: Point, toleranceM: number): number | null {
  const shape = object.shape
  if (shape.type === 'polygon') {
    return pointInPolygon(point, shape.points) ? polygonArea(shape.points) : null
  }
  if (shape.type === 'polyline') {
    const reach = shape.thicknessM / 2 + toleranceM
    const points = shapePoints(shape)
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]
      const b = points[i]
      if (a && b && nearestPointOnSegment(point, a, b).distance <= reach) {
        return perimeter(points, false) * shape.thicknessM
      }
    }
    return null
  }
  const radius = symbolRadiusM(object.kind, object.variant)
  return distance(point, shape.position) <= Math.max(radius, toleranceM)
    ? Math.PI * radius * radius
    : null
}

/**
 * The item a tap at `point` (world metres) is meant for, on visible layers only: the smallest one
 * under it (a plant before its bed or a tree canopy above it, a terrace before the lawn under
 * it), the topmost on a tie; else the plot when inside its outline; else null. The site plan is
 * never hit.
 */
export function itemAt(
  project: Project,
  point: Point,
  o: { view: PlantView; toleranceM: number },
): HitItem | null {
  const candidates: Candidate[] = []

  project.plantings.forEach((planting, index) => {
    if (!isLayerVisible(project, plantingLayer(project, planting))) return
    const plant = findPlant(project, planting.plantId)
    const radius = plantAppearance(plant, o.view, planting.plantedYear).radiusM
    if (distance(point, planting.position) > Math.max(radius, o.toleranceM)) return
    candidates.push({
      item: { type: 'planting', id: planting.id },
      footprint: Math.PI * radius * radius,
      order: orderOf(isTreeCanopy(plant) ? 'canopy' : 'plant', index),
    })
  })

  project.objects.forEach((object, index) => {
    if (!isLayerVisible(project, object.layer)) return
    const footprint = objectHit(object, point, o.toleranceM)
    if (footprint === null) return
    candidates.push({
      item: { type: 'object', id: object.id },
      footprint,
      order: orderOf(objectBand(object), index),
    })
  })

  let best: Candidate | null = null
  for (const c of candidates) {
    if (
      !best ||
      c.footprint < best.footprint ||
      (c.footprint === best.footprint && c.order > best.order)
    ) {
      best = c
    }
  }
  if (best) return best.item

  const outline = project.plot.outline
  if (
    outline.length >= 3 &&
    isLayerVisible(project, PLOT_LAYER) &&
    pointInPolygon(point, outline)
  ) {
    return { type: 'plot' }
  }
  return null
}
