import type { Plant } from '../../model/schema'
import bulbs from './bulbs.json'
import climbers from './climbers.json'
import fruit from './fruit.json'
import grassesFerns from './grasses-ferns.json'
import hedging from './hedging.json'
import herbs from './herbs.json'
import perennials from './perennials.json'
import shrubs from './shrubs.json'
import trees from './trees.json'
import vegetables from './vegetables.json'

/**
 * The built-in plant library: one JSON file per batch, drafted by Claude and spot-checked by the
 * user (`verified`). Validated against plantSchema by plants.test.ts rather than at runtime.
 * Review tables for spot-checking: `npm run plants:review`.
 */
export const PLANT_FILES = {
  trees,
  shrubs,
  hedging,
  perennials,
  'grasses-ferns': grassesFerns,
  climbers,
  bulbs,
  vegetables,
  herbs,
  fruit,
} as unknown as Record<string, readonly Plant[]>

export const BUILT_IN_PLANTS: readonly Plant[] = Object.values(PLANT_FILES).flat()

const byId = new Map(BUILT_IN_PLANTS.map((plant) => [plant.id, plant]))

export function builtInPlant(id: string): Plant | undefined {
  return byId.get(id)
}
