import { type Bounds, boundsCentre } from '../geometry/bounds'
import {
  type Placement,
  calibrate,
  imageBounds,
  initialPlacement,
  movePlacement,
  rotateAbout,
  storedRotation,
} from '../geometry/calibration'
import { roundPoint } from '../geometry/polygon'
import type { Background, LayerId, Point, Project } from './schema'

/**
 * The site plan (background image). It is selectable like an item (under this id) and is shown and
 * locked with the "background" layer.
 */
export const BACKGROUND_ID = '#background'
export const BACKGROUND_LAYER: LayerId = 'background'
export const DEFAULT_BACKGROUND_OPACITY = 0.6
/** Until it is calibrated, a new image spans this many metres along its longest side. */
export const UNCALIBRATED_LONG_SIDE_M = 50

export type NewBackground = Pick<
  Background,
  'assetId' | 'widthPx' | 'heightPx' | 'fileName' | 'page'
>

export function hasBackground(project: Project): boolean {
  return project.background !== undefined
}

/** Puts a new image on the plan, centred on `centre`, replacing the current one. */
export function setBackground(project: Project, image: NewBackground, centre: Point): Project {
  const placement = initialPlacement(
    image.widthPx,
    image.heightPx,
    centre,
    UNCALIBRATED_LONG_SIDE_M,
  )
  return {
    ...project,
    background: {
      ...image,
      ...placement,
      offset: roundPoint(placement.offset),
      opacity: project.background?.opacity ?? DEFAULT_BACKGROUND_OPACITY,
    },
  }
}

export function removeBackground(project: Project): Project {
  if (!project.background) return project
  const { background: _, ...rest } = project
  return rest
}

function withPlacement(project: Project, change: (placement: Placement) => Placement): Project {
  const background = project.background
  if (!background) return project
  const placement = change(background)
  return {
    ...project,
    background: {
      ...background,
      metresPerPixel: placement.metresPerPixel,
      offset: roundPoint(placement.offset),
      rotationDeg: placement.rotationDeg,
    },
  }
}

export function moveBackground(project: Project, dx: number, dy: number): Project {
  if (dx === 0 && dy === 0) return project
  return withPlacement(project, (p) => movePlacement(p, dx, dy))
}

/** Sets the position and rotation directly (after dragging or turning the image on the plan). */
export function placeBackground(project: Project, offset: Point, rotationDeg: number): Project {
  return withPlacement(project, (p) => ({ ...p, offset, rotationDeg }))
}

/** Turns the image about its centre; `displayDeg` is map-style (positive = anticlockwise). */
export function rotateBackground(project: Project, displayDeg: number): Project {
  const background = project.background
  if (!background) return project
  const centre = { x: background.widthPx / 2, y: background.heightPx / 2 }
  return withPlacement(project, (p) => rotateAbout(p, storedRotation(displayDeg), centre))
}

/**
 * Calibrates the scale: image pixels `a` → `b` are `distanceM` metres apart. The line is kept, so
 * it can be shown and redone later. Unchanged if the points are too close together.
 */
export function calibrateBackground(
  project: Project,
  a: Point,
  b: Point,
  distanceM: number,
): Project {
  const background = project.background
  const placement = background && calibrate(background, a, b, distanceM)
  if (!background || !placement) return project
  return {
    ...project,
    background: {
      ...background,
      metresPerPixel: placement.metresPerPixel,
      offset: roundPoint(placement.offset),
      calibration: { a: roundPoint(a), b: roundPoint(b), distanceM },
    },
  }
}

export function setBackgroundOpacity(project: Project, opacity: number): Project {
  const background = project.background
  if (!background) return project
  return { ...project, background: { ...background, opacity: Math.min(1, Math.max(0, opacity)) } }
}

/** The image's extent on the plan, or null without one. */
export function backgroundBounds(project: Project): Bounds | null {
  const background = project.background
  return background ? imageBounds(background, background.widthPx, background.heightPx) : null
}

/** The middle of the image on the plan. */
export function backgroundCentre(project: Project): Point | null {
  const bounds = backgroundBounds(project)
  return bounds ? boundsCentre(bounds) : null
}

/** Ids of the assets the project uses; anything else stored for it can be removed. */
export function assetIdsInUse(project: Project): Set<string> {
  return new Set(project.background ? [project.background.assetId] : [])
}
