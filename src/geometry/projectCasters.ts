import { symbolRadiusM } from '../model/objectKinds'
import { findPlant } from '../model/plants'
import type {
  GardenObject,
  ObjectKind,
  Plant,
  PlantCategory,
  Planting,
  Project,
} from '../model/schema'
import {
  type Caster,
  prismFromPolygon,
  prismFromPolyline,
  TREE_CANOPY_BASE_FRACTION,
} from './shadows'

/**
 * Turns a design into shadow casters (shadows.ts). Kept apart from shadows.ts so the sun-hours
 * worker doesn't pull in the plant library: the UI builds the casters and hands them over.
 *
 * - Every object with a height casts a shadow, wherever it is (also outside the plot): polygons
 *   and thick polylines as prisms, point objects as posts (cylinders of their symbol's radius).
 *   Pergolas and carports are roofs on posts: a ROOF_THICKNESS_M slab at the top.
 * - Plantings of trees, shrubs, hedging plants and fruit that are at least `minPlantHeightM` tall
 *   cast a canopy shadow (radius = spread / 2). Trees and fruit trees (fruit ≥ 3 m) have their
 *   canopy from a third of their height up; shrubs and hedging plants are solid from the ground.
 */

/** Plant categories whose plantings cast shadows. */
export const SHADOW_PLANT_CATEGORIES = [
  'tree',
  'shrub',
  'hedge',
  'fruit',
] as const satisfies PlantCategory[]

/** Plantings lower than this cast no shadow by default (their shadow is negligible). */
export const MIN_SHADOW_PLANT_HEIGHT_M = 0.5

/** Kinds that are a roof on posts; only the roof casts a shadow. */
export const ROOF_KINDS = ['pergola', 'carport'] as const satisfies ObjectKind[]
export const ROOF_THICKNESS_M = 0.3

/** Fruit plants at least this tall are fruit trees: canopy from a third of their height. */
const FRUIT_TREE_HEIGHT_M = 3

export type PlantSize = { heightM: number; spreadM: number }

export type CasterOptions = {
  /** Size of a planting; defaults to the plant's mature size (M13 passes the size for a year). */
  plantSize?: (planting: Planting, plant: Plant) => PlantSize
  /** Default MIN_SHADOW_PLANT_HEIGHT_M. */
  minPlantHeightM?: number
}

/** Fraction of a plant's height where its canopy starts. */
export function canopyBaseFraction(plant: Plant, heightM = plant.heightM): number {
  if (plant.category === 'tree') return TREE_CANOPY_BASE_FRACTION
  if (plant.category === 'fruit' && heightM >= FRUIT_TREE_HEIGHT_M) return TREE_CANOPY_BASE_FRACTION
  return 0
}

export function objectCaster(object: GardenObject): Caster | null {
  const heightM = object.heightM
  if (!heightM) return null
  const roof = (ROOF_KINDS as readonly ObjectKind[]).includes(object.kind)
  const baseM = roof ? Math.max(0, heightM - ROOF_THICKNESS_M) : 0
  const { shape } = object
  switch (shape.type) {
    case 'polygon':
      return { ...prismFromPolygon(shape.points, heightM, baseM), sourceId: object.id }
    case 'polyline':
      return {
        ...prismFromPolyline(shape.points, shape.thicknessM, heightM, baseM),
        sourceId: object.id,
      }
    case 'point':
      return {
        kind: 'canopy',
        centre: shape.position,
        radiusM: symbolRadiusM(object.kind, object.variant),
        baseM,
        topM: heightM,
        sourceId: object.id,
      }
  }
}

export function plantingCaster(
  project: Project,
  planting: Planting,
  options: CasterOptions = {},
): Caster | null {
  const plant = findPlant(project, planting.plantId)
  if (!plant || !(SHADOW_PLANT_CATEGORIES as readonly PlantCategory[]).includes(plant.category)) {
    return null
  }
  const { heightM, spreadM } = options.plantSize?.(planting, plant) ?? plant
  if (!(heightM >= (options.minPlantHeightM ?? MIN_SHADOW_PLANT_HEIGHT_M)) || !(spreadM > 0)) {
    return null
  }
  return {
    kind: 'canopy',
    centre: planting.position,
    radiusM: spreadM / 2,
    baseM: heightM * canopyBaseFraction(plant, heightM),
    topM: heightM,
    sourceId: planting.id,
  }
}

/** Everything in the design that casts a shadow. */
export function projectCasters(project: Project, options: CasterOptions = {}): Caster[] {
  const casters: Caster[] = []
  for (const object of project.objects) {
    const caster = objectCaster(object)
    if (caster) casters.push(caster)
  }
  for (const planting of project.plantings) {
    const caster = plantingCaster(project, planting, options)
    if (caster) casters.push(caster)
  }
  return casters
}
