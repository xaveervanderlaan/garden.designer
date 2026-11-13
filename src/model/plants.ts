import type { LayerId, Plant, Planting, Project } from './schema'

/** Radius used for a planting whose plant is unknown (the built-in library arrives in M5). */
export const DEFAULT_PLANTING_RADIUS_M = 0.25

/** Looks up a plant: the project's custom plants for now; the built-in library is added in M5. */
export function findPlant(project: Project, plantId: string): Plant | undefined {
  return project.customPlants.find((plant) => plant.id === plantId)
}

/** Drawn radius of a planting: half its mature spread. */
export function plantingRadiusM(project: Project, planting: Planting): number {
  const plant = findPlant(project, planting.plantId)
  return plant ? plant.spreadM / 2 : DEFAULT_PLANTING_RADIUS_M
}

/** Vegetables and herbs live on the vegetables layer; everything else on beds & plants. */
export function plantingLayer(project: Project, planting: Planting): LayerId {
  const category = findPlant(project, planting.plantId)?.category
  return category === 'vegetable' || category === 'herb' ? 'vegetables' : 'plants'
}
