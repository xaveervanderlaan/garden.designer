import type { Point } from '../model/schema'
import { type Bounds, boundsOfPoints } from './bounds'
import { distance } from './polygon'
import { normaliseDegrees } from './transform'

/**
 * Where an image (the site plan) lies on the plan. Image pixels map to world metres as
 *
 *   world = offset + R(rotationDeg) · (pixel × metresPerPixel)
 *
 * so `offset` is the world position of the image's top-left corner, and the image turns about that
 * corner. Like Konva, a positive rotation turns clockwise on screen (y points down).
 */
export type Placement = {
  metresPerPixel: number
  offset: Point
  rotationDeg: number
}

function rotate(p: Point, degrees: number): Point {
  const r = (degrees * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  return { x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos }
}

export function imageToWorld(placement: Placement, pixel: Point): Point {
  const { metresPerPixel: s, offset, rotationDeg } = placement
  const turned = rotate({ x: pixel.x * s, y: pixel.y * s }, rotationDeg)
  return { x: offset.x + turned.x, y: offset.y + turned.y }
}

export function worldToImage(placement: Placement, world: Point): Point {
  const { metresPerPixel: s, offset, rotationDeg } = placement
  const local = rotate({ x: world.x - offset.x, y: world.y - offset.y }, -rotationDeg)
  return { x: local.x / s, y: local.y / s }
}

/** The offset that puts image pixel `pixel` at world point `world` (scale and rotation given). */
function offsetFor(pixel: Point, world: Point, metresPerPixel: number, rotationDeg: number): Point {
  const turned = rotate({ x: pixel.x * metresPerPixel, y: pixel.y * metresPerPixel }, rotationDeg)
  return { x: world.x - turned.x, y: world.y - turned.y }
}

/** The image's four corners on the plan (top-left, top-right, bottom-right, bottom-left). */
export function imageCorners(placement: Placement, widthPx: number, heightPx: number): Point[] {
  return [
    { x: 0, y: 0 },
    { x: widthPx, y: 0 },
    { x: widthPx, y: heightPx },
    { x: 0, y: heightPx },
  ].map((p) => imageToWorld(placement, p))
}

export function imageBounds(placement: Placement, widthPx: number, heightPx: number): Bounds {
  return boundsOfPoints(imageCorners(placement, widthPx, heightPx))!
}

/**
 * A first placement for a new image: `longSideM` metres along its longest side, centred on
 * `centre`, not rotated. Calibration then sets the real scale.
 */
export function initialPlacement(
  widthPx: number,
  heightPx: number,
  centre: Point,
  longSideM: number,
): Placement {
  const metresPerPixel = longSideM / Math.max(widthPx, heightPx)
  return {
    metresPerPixel,
    offset: {
      x: centre.x - (widthPx * metresPerPixel) / 2,
      y: centre.y - (heightPx * metresPerPixel) / 2,
    },
    rotationDeg: 0,
  }
}

/** Below this many pixels apart, two calibration points are too close to measure with. */
export const MIN_CALIBRATION_PX = 1

/**
 * Sets the scale so that image pixels `a` → `b` are `distanceM` metres apart. The middle of that
 * line stays where it is on the plan, and the rotation is kept. Returns null when the points are
 * (nearly) the same or the distance isn't positive.
 */
export function calibrate(
  placement: Placement,
  a: Point,
  b: Point,
  distanceM: number,
): Placement | null {
  const pixels = distance(a, b)
  if (!(pixels >= MIN_CALIBRATION_PX) || !(distanceM > 0) || !Number.isFinite(distanceM)) {
    return null
  }
  const metresPerPixel = distanceM / pixels
  const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  const middleWorld = imageToWorld(placement, middle)
  return {
    ...placement,
    metresPerPixel,
    offset: offsetFor(middle, middleWorld, metresPerPixel, placement.rotationDeg),
  }
}

/** Turns the image to `rotationDeg` (clockwise on screen) about image pixel `pivot`. */
export function rotateAbout(placement: Placement, rotationDeg: number, pivot: Point): Placement {
  const rotation = normaliseDegrees(rotationDeg)
  const pivotWorld = imageToWorld(placement, pivot)
  return {
    ...placement,
    rotationDeg: rotation,
    offset: offsetFor(pivot, pivotWorld, placement.metresPerPixel, rotation),
  }
}

/** Shifts the image by (dx, dy) metres. */
export function movePlacement(placement: Placement, dx: number, dy: number): Placement {
  return { ...placement, offset: { x: placement.offset.x + dx, y: placement.offset.y + dy } }
}

/**
 * Rotations shown to the user are map-style, like the angles when drawing: positive turns
 * anticlockwise, in the range (-180, 180]. Stored rotations turn clockwise on screen, in [0, 360).
 */
export function displayRotation(rotationDeg: number): number {
  const anticlockwise = normaliseDegrees(-rotationDeg)
  return anticlockwise > 180 ? anticlockwise - 360 : anticlockwise
}

export function storedRotation(displayDeg: number): number {
  return normaliseDegrees(-displayDeg)
}
