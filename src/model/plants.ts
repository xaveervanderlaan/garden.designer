import { BUILT_IN_PLANTS, builtInPlant } from '../data/plants'
import { newId } from './ids'
import {
  EDIBLE_CATEGORIES,
  type LayerId,
  type Plant,
  type PlantCategory,
  type Planting,
  type Project,
  type SoilType,
} from './schema'

/** Radius used for a planting whose plant is unknown (e.g. a custom plant that was deleted). */
export const DEFAULT_PLANTING_RADIUS_M = 0.25

/** Ids of custom plants start with this, so they can never clash with a built-in plant. */
export const CUSTOM_PLANT_PREFIX = 'custom-'

/** Looks up a plant: the project's custom plants first, then the built-in library. */
export function findPlant(project: Project, plantId: string): Plant | undefined {
  return project.customPlants.find((plant) => plant.id === plantId) ?? builtInPlant(plantId)
}

export function isCustomPlant(project: Project, plantId: string): boolean {
  return project.customPlants.some((plant) => plant.id === plantId)
}

/** Every plant available in a design: the built-in library plus its custom plants. */
export function allPlants(project: Pick<Project, 'customPlants'>): Plant[] {
  return [...BUILT_IN_PLANTS, ...project.customPlants]
}

/** The plant's name in the given language, falling back to the other language, then Latin. */
export function plantName(plant: Plant, lang: 'en' | 'nl'): string {
  const other = lang === 'en' ? 'nl' : 'en'
  return plant.names[lang] || plant.names[other] || plant.names.latin
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

/** Vegetables, herbs and fruit have a sowing/harvest calendar. */
export function hasVegCalendar(category: PlantCategory): boolean {
  return (EDIBLE_CATEGORIES as readonly PlantCategory[]).includes(category)
}

/**
 * How well a plant suits the design's soil:
 * - `suited`: the soil is one it does well in;
 * - `dry`: it suits the soil, but sand dries out and the plant isn't drought tolerant;
 * - `unsuited`: the soil isn't one it does well in.
 */
export type SoilSuitability = 'suited' | 'dry' | 'unsuited'

export function soilSuitability(plant: Plant, soil: SoilType): SoilSuitability {
  if (!plant.soil.includes(soil)) return 'unsuited'
  if (soil === 'sand' && !plant.droughtTolerant) return 'dry'
  return 'suited'
}

// --- Custom plants ----------------------------------------------------------------------------

export function newCustomPlantId(): string {
  return `${CUSTOM_PLANT_PREFIX}${newId()}`
}

/** Starting values for a new custom plant: a perennial for sun on any soil. */
export function blankCustomPlant(): Plant {
  return {
    id: newCustomPlantId(),
    names: { nl: '', en: '', latin: '' },
    category: 'perennial',
    heightM: 0.5,
    spreadM: 0.4,
    yearsToMature: 2,
    evergreen: false,
    sun: ['full-sun'],
    soil: ['clay', 'sand', 'peat'],
    droughtTolerant: false,
    bloomMonths: [],
    flowerColors: [],
    foliageColor: 'green',
    nativeNL: false,
    wildlife: [],
    toxic: false,
    verified: true,
  }
}

/**
 * A copy of a (built-in) plant to adapt, e.g. for a cultivar with another colour. It gets its own
 * id; a custom plant counts as checked (the user made it).
 */
export function customCopyOf(plant: Plant): Plant {
  return { ...structuredClone(plant), id: newCustomPlantId(), verified: true }
}

/** Adds a custom plant, or replaces the one with the same id. */
export function saveCustomPlant(project: Project, plant: Plant): Project {
  const exists = project.customPlants.some((p) => p.id === plant.id)
  return {
    ...project,
    customPlants: exists
      ? project.customPlants.map((p) => (p.id === plant.id ? plant : p))
      : [...project.customPlants, plant],
  }
}

export function plantingCount(project: Project, plantId: string): number {
  return project.plantings.filter((p) => p.plantId === plantId).length
}

/** Removes a custom plant together with its plantings on the plan. */
export function deleteCustomPlant(project: Project, plantId: string): Project {
  if (!isCustomPlant(project, plantId)) return project
  return {
    ...project,
    customPlants: project.customPlants.filter((p) => p.id !== plantId),
    plantings: project.plantings.filter((p) => p.plantId !== plantId),
  }
}
