import { isBed, relinkBeds } from './beds'
import { type DrawBand, OBJECT_PRESETS } from './objectKinds'
import { findPlant } from './plants'
import type { GardenObject, Plant, Planting, Project } from './schema'

/**
 * The drawing order (see DRAW_BANDS in objectKinds.ts): every object and planting belongs to a
 * band, and within a band the order of `project.objects` / `project.plantings` decides (later =
 * on top). Bringing things forward or sending them back reorders those arrays within a band, so
 * the order is saved with the design and nothing ever jumps to another band.
 */

/** Fruit plants at least this tall are trees: their canopy is drawn over structures. */
const FRUIT_TREE_HEIGHT_M = 3

export function objectBand(object: GardenObject): DrawBand {
  return OBJECT_PRESETS[object.kind].band
}

/** Trees (and fruit trees) are drawn as see-through canopies on top of everything else. */
export function isTreeCanopy(plant: Plant | undefined): boolean {
  return (
    !!plant &&
    (plant.category === 'tree' ||
      (plant.category === 'fruit' && plant.heightM >= FRUIT_TREE_HEIGHT_M))
  )
}

export function plantingBand(project: Project, planting: Planting): 'plant' | 'canopy' {
  return isTreeCanopy(findPlant(project, planting.plantId)) ? 'canopy' : 'plant'
}

export type ReorderDirection = 'forward' | 'backward' | 'front' | 'back'

/**
 * Moves the selected items of a list one step up (forward) or down (backward), or all the way
 * (front/back), keeping their order among themselves. A selected item passes one unselected item
 * per step. Returns the same list when nothing moves.
 */
export function reorder<T>(
  items: readonly T[],
  selected: (item: T) => boolean,
  direction: ReorderDirection,
): readonly T[] {
  const list = [...items]
  let changed = false
  const swap = (i: number, j: number) => {
    ;[list[i], list[j]] = [list[j]!, list[i]!]
    changed = true
  }
  switch (direction) {
    case 'forward':
      for (let i = list.length - 2; i >= 0; i--) {
        if (selected(list[i]!) && !selected(list[i + 1]!)) swap(i, i + 1)
      }
      break
    case 'backward':
      for (let i = 1; i < list.length; i++) {
        if (selected(list[i]!) && !selected(list[i - 1]!)) swap(i, i - 1)
      }
      break
    case 'front':
    case 'back': {
      const chosen = list.filter(selected)
      const others = list.filter((item) => !selected(item))
      const result = direction === 'front' ? [...others, ...chosen] : [...chosen, ...others]
      return result.every((item, i) => item === items[i]) ? items : result
    }
  }
  return changed ? list : items
}

/** Reorders the items of each band separately; items keep the array slots of their band. */
function reorderWithinBands<T>(
  items: readonly T[],
  bandOf: (item: T) => string,
  selected: (item: T) => boolean,
  direction: ReorderDirection,
): readonly T[] {
  const slots = new Map<string, number[]>()
  items.forEach((item, i) => {
    const band = bandOf(item)
    slots.set(band, [...(slots.get(band) ?? []), i])
  })
  let result: T[] | null = null
  for (const indices of slots.values()) {
    const members = indices.map((i) => items[i]!)
    const moved = reorder(members, selected, direction)
    if (moved === members) continue
    result ??= [...items]
    indices.forEach((slot, k) => (result![slot] = moved[k]!))
  }
  return result ?? items
}

/**
 * Brings the given objects and plantings forward or sends them back within their bands. Beds
 * that change places may change which bed a plant belongs to (the topmost one).
 */
export function reorderItems(
  project: Project,
  ids: ReadonlySet<string>,
  direction: ReorderDirection,
): Project {
  const objects = reorderWithinBands(project.objects, objectBand, (o) => ids.has(o.id), direction)
  const plantings = reorderWithinBands(
    project.plantings,
    (p) => plantingBand(project, p),
    (p) => ids.has(p.id),
    direction,
  )
  if (objects === project.objects && plantings === project.plantings) return project
  const next = { ...project, objects: [...objects], plantings: [...plantings] }
  return objects !== project.objects && project.objects.some((o) => ids.has(o.id) && isBed(o))
    ? relinkBeds(next)
    : next
}

/** Objects of one band in drawing order. */
export function objectsInBand(project: Project, band: DrawBand): GardenObject[] {
  return project.objects.filter((o) => objectBand(o) === band)
}
