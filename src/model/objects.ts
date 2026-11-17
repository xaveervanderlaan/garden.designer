import { frameScaling, rectangleAround, shapeFrameBox, shapeFrameDeg } from '../geometry/frame'
import { insertCorner, moveCorner, setEdgeLength } from '../geometry/outline'
import { roundPoint } from '../geometry/polygon'
import { normaliseDegrees, rotation } from '../geometry/transform'
import { isBed, isBedKind, relinkBeds } from './beds'
import { transformObjects } from './edit'
import { newId } from './ids'
import {
  OBJECT_PRESETS,
  type MaterialId,
  type SymbolVariantId,
  hasHeight,
  materialsFor,
  objectLayer,
  symbolFor,
} from './objectKinds'
import { findPlant } from './plants'
import type { GardenObject, ObjectKind, ObjectStatus, Point, Project, Shape } from './schema'

/**
 * Operations on garden objects of any kind (structures, surfaces, boundaries, symbols, beds):
 * creating them from their kind's preset, status, type, size and rotation, and corner editing.
 * Moving, rotating and resizing on the canvas go through edit.ts (moveItems, transformObjects).
 */

/** Fewest points of a shape: 3 corners for a polygon, 2 for a line, 1 for a symbol. */
export const MIN_POINTS: Record<Shape['type'], number> = { polygon: 3, polyline: 2, point: 1 }

/** Polylines get at least this thickness. */
export const MIN_THICKNESS_M = 0.01

export function findObject(project: Project, id: string): GardenObject | undefined {
  return project.objects.find((o) => o.id === id)
}

/** The shape for points drawn with a kind's tool (null if there are too few). */
export function shapeForKind(kind: ObjectKind, points: readonly Point[]): Shape | null {
  const preset = OBJECT_PRESETS[kind]
  if (points.length < MIN_POINTS[preset.shape]) return null
  const rounded = points.map(roundPoint)
  switch (preset.shape) {
    case 'polygon':
      return { type: 'polygon', points: rounded }
    case 'polyline':
      return { type: 'polyline', points: rounded, thicknessM: preset.thicknessM ?? 0.1 }
    case 'point':
      return { type: 'point', position: rounded[0]!, rotationDeg: 0 }
  }
}

/** A polygon kind's default footprint (its preset size), centred on `centre`. */
export function defaultFootprint(kind: ObjectKind, centre: Point): Point[] | null {
  const size = OBJECT_PRESETS[kind].sizeM
  if (OBJECT_PRESETS[kind].shape !== 'polygon' || !size) return null
  return rectangleAround(centre, size.width, size.depth)
}

/**
 * Adds an object of a kind with its preset's status and height (one undo step when used in a
 * single update). A bed links the plants already inside it.
 */
export function addObject(
  project: Project,
  kind: ObjectKind,
  shape: Shape,
  options: { status?: ObjectStatus; variant?: SymbolVariantId } = {},
): { project: Project; id: string } {
  const preset = OBJECT_PRESETS[kind]
  const status = options.status ?? preset.status
  const symbol = symbolFor(kind, options.variant)
  const object: GardenObject = {
    id: newId(),
    kind,
    shape,
    ...(symbol && options.variant ? { variant: symbol.id } : {}),
    ...(preset.heightM === undefined ? {} : { heightM: preset.heightM }),
    status,
    layer: objectLayer(kind, status),
  }
  const added = { ...project, objects: [...project.objects, object] }
  return { project: isBed(object) ? relinkBeds(added) : added, id: object.id }
}

function updateObjects(
  project: Project,
  ids: ReadonlySet<string>,
  change: (object: GardenObject) => GardenObject,
): Project {
  let changed = false
  const objects = project.objects.map((o) => {
    if (!ids.has(o.id)) return o
    const next = change(o)
    if (next !== o) changed = true
    return next
  })
  return changed ? { ...project, objects } : project
}

/** Marks objects as existing or new, which moves them to the matching layer. */
export function setObjectStatus(
  project: Project,
  ids: ReadonlySet<string>,
  status: ObjectStatus,
): Project {
  return updateObjects(project, ids, (o) =>
    o.status === status ? o : { ...o, status, layer: objectLayer(o.kind, status) },
  )
}

/**
 * Changes an object's type (e.g. shed → greenhouse), keeping its shape. It keeps its height when
 * the new type has one too (or gets the new type's default), and loses it otherwise. Only for a
 * type with the same kind of shape.
 */
export function setObjectKind(project: Project, id: string, kind: ObjectKind): Project {
  const object = findObject(project, id)
  if (!object || object.kind === kind || OBJECT_PRESETS[kind].shape !== object.shape.type) {
    return project
  }
  const { heightM, material, variant, plantId, ...rest } = object
  const height = hasHeight(kind) ? (heightM ?? OBJECT_PRESETS[kind].heightM) : undefined
  const changed: GardenObject = {
    ...rest,
    kind,
    ...(material !== undefined && materialsFor(kind).includes(material as MaterialId)
      ? { material }
      : {}),
    ...(variant !== undefined && symbolFor(kind) && symbolFor(kind, variant)?.id === variant
      ? { variant }
      : {}),
    ...(plantId !== undefined && kind === 'hedge' ? { plantId } : {}),
    ...(height === undefined ? {} : { heightM: height }),
    layer: objectLayer(kind, object.status),
  }
  const next = updateObjects(project, new Set([id]), () => changed)
  // Whether it holds plants may have changed (e.g. a raised bed became a shed).
  return isBedKind(kind) || isBedKind(object.kind) ? relinkBeds(next) : next
}

/** Sets a surface's material; refused if it isn't in the kind's list. */
export function setObjectMaterial(project: Project, id: string, material: MaterialId): Project {
  const object = findObject(project, id)
  if (!object || !materialsFor(object.kind).includes(material) || object.material === material) {
    return project
  }
  return updateObjects(project, new Set([id]), (o) => ({ ...o, material }))
}

/** Sets a symbol's variant; refused if the kind has no such variant. */
export function setObjectVariant(project: Project, id: string, variant: SymbolVariantId): Project {
  const object = findObject(project, id)
  const symbol = object ? symbolFor(object.kind, variant) : null
  if (!object || !symbol || symbol.id !== variant || object.variant === variant) return project
  return updateObjects(project, new Set([id]), (o) => ({ ...o, variant }))
}

/** Links a hedge to a hedging species (null: unlink). Other kinds and other plants are refused. */
export function setHedgePlant(project: Project, id: string, plantId: string | null): Project {
  const object = findObject(project, id)
  if (!object || object.kind !== 'hedge') return project
  if (plantId === null) {
    if (object.plantId === undefined) return project
    return updateObjects(project, new Set([id]), (o) => {
      const { plantId: _removed, ...rest } = o
      return rest
    })
  }
  if (findPlant(project, plantId)?.category !== 'hedge' || object.plantId === plantId) {
    return project
  }
  return updateObjects(project, new Set([id]), (o) => ({ ...o, plantId }))
}

/**
 * Sets an object's width and/or depth (in its own frame, see geometry/frame.ts), about the centre
 * of its frame box. Polygons and polylines only; a zero-size side can't be scaled.
 */
export function resizeObject(
  project: Project,
  id: string,
  size: { widthM?: number; depthM?: number },
): Project {
  const object = findObject(project, id)
  if (!object || object.shape.type === 'point') return project
  const box = shapeFrameBox(object.shape)
  const factor = (target: number | undefined, current: number) =>
    target === undefined || !(target > 0) || current < 1e-9 ? 1 : target / current
  const sx = factor(size.widthM, box.width)
  const sy = factor(size.depthM, box.depth)
  if (sx === 1 && sy === 1) return project
  const m = frameScaling(box.angleDeg, box.centre, sx, sy)
  return roundObject(transformObjects(project, new Map([[id, m]])), id)
}

/** Rounds an object's coordinates (after a transform), so stored numbers stay clean. */
function roundObject(project: Project, id: string): Project {
  return updateObjects(project, new Set([id]), (o) => ({ ...o, shape: roundShape(o.shape) }))
}

export function roundShape(shape: Shape): Shape {
  switch (shape.type) {
    case 'polygon':
    case 'polyline':
      return { ...shape, points: shape.points.map(roundPoint) }
    case 'point':
      return { ...shape, position: roundPoint(shape.position) }
  }
}

/**
 * An object's rotation as shown in the properties panel: map-style degrees (anticlockwise
 * positive). Polygons: their frame, in [-45°, 45°]. Symbols: their rotation, in [0°, 360°).
 * Polylines have none (null).
 */
export function objectRotation(shape: Shape): number | null {
  switch (shape.type) {
    case 'polygon':
      return -shapeFrameDeg(shape) + 0
    case 'point':
      return normaliseDegrees(-shape.rotationDeg)
    case 'polyline':
      return null
  }
}

/** Turns an object about its frame's centre so that objectRotation becomes `degrees`. */
export function rotateObjectTo(project: Project, id: string, degrees: number): Project {
  const object = findObject(project, id)
  const current = object ? objectRotation(object.shape) : null
  if (!object || current === null || !Number.isFinite(degrees)) return project
  const turn = degrees - current
  if (Math.abs(turn) < 1e-9) return project
  const box = shapeFrameBox(object.shape)
  // Map-style degrees are anticlockwise; the transform is clockwise on screen.
  const m = rotation(-turn, box.centre)
  return roundObject(transformObjects(project, new Map([[id, m]])), id)
}

export function setPolylineThickness(project: Project, id: string, thicknessM: number): Project {
  if (!(thicknessM >= MIN_THICKNESS_M)) return project
  return updateObjects(project, new Set([id]), (o) =>
    o.shape.type === 'polyline' && o.shape.thicknessM !== thicknessM
      ? { ...o, shape: { ...o.shape, thicknessM } }
      : o,
  )
}

// --- Corners --------------------------------------------------------------------------------

function withObjectPoints(
  project: Project,
  id: string,
  change: (points: readonly Point[], closed: boolean) => readonly Point[],
): Project {
  const object = findObject(project, id)
  if (!object || object.shape.type === 'point') return project
  const shape = object.shape
  const points = change(shape.points, shape.type === 'polygon')
  if (points === shape.points) return project
  const next = updateObjects(project, new Set([id]), (o) => ({
    ...o,
    shape: { ...shape, points: points.map(roundPoint) },
  }))
  return isBed(object) ? relinkBeds(next) : next
}

export function moveObjectCorner(project: Project, id: string, index: number, to: Point): Project {
  return withObjectPoints(project, id, (points) => moveCorner(points, index, to))
}

export function insertObjectCorner(
  project: Project,
  id: string,
  after: number,
  at: Point,
): Project {
  return withObjectPoints(project, id, (points) => insertCorner(points, after, at))
}

/** Removes a corner; refused below 3 corners (polygon) or 2 points (line). */
export function removeObjectCorner(project: Project, id: string, index: number): Project {
  return withObjectPoints(project, id, (points, closed) =>
    points.length <= (closed ? MIN_POINTS.polygon : MIN_POINTS.polyline)
      ? points
      : points.filter((_, i) => i !== index),
  )
}

export function setObjectEdgeLength(
  project: Project,
  id: string,
  index: number,
  length: number,
): Project {
  return withObjectPoints(project, id, (points, closed) =>
    !closed && index >= points.length - 1 ? points : setEdgeLength(points, index, length),
  )
}
