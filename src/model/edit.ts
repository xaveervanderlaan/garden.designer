import {
  type Matrix,
  applyMatrix,
  normaliseDegrees,
  rotationOf,
  translation,
} from '../geometry/transform'
import { BACKGROUND_ID, BACKGROUND_LAYER, hasBackground } from './background'
import { newId } from './ids'
import { plantingLayer } from './plants'
import { PLOT_ID, PLOT_LAYER, hasPlot } from './plot'
import type { GardenObject, LayerId, Planting, Project, Shape } from './schema'

/**
 * Pure editing operations on a project. "Items" are the selectable things on the plan: garden
 * objects and plantings (their ids are unique within a project).
 */

export function itemLayer(project: Project, id: string): LayerId | undefined {
  const object = project.objects.find((o) => o.id === id)
  if (object) return object.layer
  const planting = project.plantings.find((p) => p.id === id)
  return planting ? plantingLayer(project, planting) : undefined
}

export function isLayerVisible(project: Project, layer: LayerId): boolean {
  return project.layers[layer].visible
}

/** Items on hidden or locked layers can't be selected or edited. */
export function isLayerEditable(project: Project, layer: LayerId): boolean {
  const state = project.layers[layer]
  return state.visible && !state.locked
}

/** Ids of every item that can currently be selected. */
export function editableItemIds(project: Project): string[] {
  return [
    ...project.objects.filter((o) => isLayerEditable(project, o.layer)).map((o) => o.id),
    ...project.plantings
      .filter((p) => isLayerEditable(project, plantingLayer(project, p)))
      .map((p) => p.id),
  ]
}

/**
 * Keeps only ids that still exist and are editable (e.g. after undo or locking a layer). The plot
 * (PLOT_ID) counts when it has an outline and its layer is editable; the site plan
 * (BACKGROUND_ID) when there is one and its layer is editable.
 */
export function validSelection(project: Project, ids: readonly string[]): string[] {
  const editable = new Set(editableItemIds(project))
  if (hasPlot(project) && isLayerEditable(project, PLOT_LAYER)) editable.add(PLOT_ID)
  if (hasBackground(project) && isLayerEditable(project, BACKGROUND_LAYER)) {
    editable.add(BACKGROUND_ID)
  }
  return ids.filter((id) => editable.has(id))
}

/** True when the site plan is the only thing selected. */
export function isBackgroundSelected(project: Project, ids: readonly string[]): boolean {
  const valid = validSelection(project, ids)
  return valid.length === 1 && valid[0] === BACKGROUND_ID
}

/** Shows/hides or (un)locks a layer. */
export function setLayerState(
  project: Project,
  layer: LayerId,
  state: Partial<Project['layers'][LayerId]>,
): Project {
  const current = project.layers[layer]
  if (
    Object.entries(state).every(([key, value]) => current[key as keyof typeof current] === value)
  ) {
    return project
  }
  return { ...project, layers: { ...project.layers, [layer]: { ...current, ...state } } }
}

/** True when the plot is the only thing selected: then its corners can be edited. */
export function isPlotSelected(project: Project, ids: readonly string[]): boolean {
  const valid = validSelection(project, ids)
  return valid.length === 1 && valid[0] === PLOT_ID
}

// --- Geometry ---------------------------------------------------------------------------------

export function transformShape(shape: Shape, m: Matrix): Shape {
  switch (shape.type) {
    case 'polygon':
      return { ...shape, points: shape.points.map((p) => applyMatrix(m, p)) }
    case 'polyline':
      return { ...shape, points: shape.points.map((p) => applyMatrix(m, p)) }
    case 'point':
      return {
        ...shape,
        position: applyMatrix(m, shape.position),
        rotationDeg: normaliseDegrees(shape.rotationDeg + rotationOf(m)),
      }
  }
}

export function moveItems(
  project: Project,
  ids: ReadonlySet<string>,
  dx: number,
  dy: number,
): Project {
  if (dx === 0 && dy === 0) return project
  const m = translation(dx, dy)
  return {
    ...project,
    objects: project.objects.map((o) =>
      ids.has(o.id) ? { ...o, shape: transformShape(o.shape, m) } : o,
    ),
    plantings: project.plantings.map((p) =>
      ids.has(p.id) ? { ...p, position: applyMatrix(m, p.position) } : p,
    ),
  }
}

/** Applies a transform per object (e.g. after rotating/resizing on the canvas). */
export function transformObjects(
  project: Project,
  transforms: ReadonlyMap<string, Matrix>,
): Project {
  return {
    ...project,
    objects: project.objects.map((o) => {
      const m = transforms.get(o.id)
      return m ? { ...o, shape: transformShape(o.shape, m) } : o
    }),
  }
}

// --- Item fields ------------------------------------------------------------------------------

type ObjectFields = Pick<GardenObject, 'label' | 'notes' | 'heightM' | 'material'>
type PlantingFields = Pick<Planting, 'notes' | 'plantedYear'>

/** Sets (or, with undefined, removes) fields of one object. */
export function updateObject(project: Project, id: string, fields: Partial<ObjectFields>): Project {
  return {
    ...project,
    objects: project.objects.map((o) => (o.id === id ? withFields(o, fields) : o)),
  }
}

export function updatePlanting(
  project: Project,
  id: string,
  fields: Partial<PlantingFields>,
): Project {
  return {
    ...project,
    plantings: project.plantings.map((p) => (p.id === id ? withFields(p, fields) : p)),
  }
}

function withFields<T extends object>(item: T, fields: Partial<Record<string, unknown>>): T {
  const result: Record<string, unknown> = { ...(item as Record<string, unknown>) }
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === '') delete result[key]
    else result[key] = value
  }
  return result as T
}

// --- Delete / copy / paste --------------------------------------------------------------------

export function deleteItems(project: Project, ids: ReadonlySet<string>): Project {
  const deletedBeds = new Set(project.objects.filter((o) => ids.has(o.id)).map((o) => o.id))
  return {
    ...project,
    objects: project.objects.filter((o) => !ids.has(o.id)),
    plantings: project.plantings
      .filter((p) => !ids.has(p.id))
      .map((p) => (p.bedId && deletedBeds.has(p.bedId) ? withoutBed(p) : p)),
  }
}

function withoutBed(planting: Planting): Planting {
  const { bedId: _, ...rest } = planting
  return rest
}

export type Clipboard = { objects: GardenObject[]; plantings: Planting[] }

export function copyItems(project: Project, ids: ReadonlySet<string>): Clipboard | null {
  const objects = project.objects.filter((o) => ids.has(o.id))
  const plantings = project.plantings.filter((p) => ids.has(p.id))
  if (objects.length === 0 && plantings.length === 0) return null
  return structuredClone({ objects, plantings })
}

/**
 * Adds copies of the clipboard items with new ids, shifted by (dx, dy). Plantings keep their bed
 * if that bed was copied along (pointing to the new copy) or still exists in the project.
 */
export function pasteItems(
  project: Project,
  clipboard: Clipboard,
  dx: number,
  dy: number,
): { project: Project; ids: string[] } {
  const m = translation(dx, dy)
  const newIds = new Map<string, string>()
  const objects = clipboard.objects.map((o) => {
    const id = newId()
    newIds.set(o.id, id)
    return { ...structuredClone(o), id, shape: transformShape(o.shape, m) }
  })
  const existingIds = new Set(project.objects.map((o) => o.id))
  const plantings = clipboard.plantings.map((p): Planting => {
    const copy: Planting = {
      ...structuredClone(p),
      id: newId(),
      position: applyMatrix(m, p.position),
    }
    if (!p.bedId) return copy
    const bedId = newIds.get(p.bedId) ?? (existingIds.has(p.bedId) ? p.bedId : undefined)
    return bedId ? { ...copy, bedId } : withoutBed(copy)
  })
  return {
    project: {
      ...project,
      objects: [...project.objects, ...objects],
      plantings: [...project.plantings, ...plantings],
    },
    ids: [...objects.map((o) => o.id), ...plantings.map((p) => p.id)],
  }
}
