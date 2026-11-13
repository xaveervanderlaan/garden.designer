import type { Point } from '../model/schema'
import type { Bounds } from './bounds'

/** Maps world metres to screen pixels: screen = world × scale + (x, y). */
export type Viewport = { x: number; y: number; scale: number }
export type Size = { width: number; height: number }

/** Zoom limits in pixels per metre. */
export const MIN_SCALE = 2
export const MAX_SCALE = 1000

/** 100 % zoom = a 1:100 drawing on a 96-dpi screen (1 m on the ground = 1 cm on screen). */
export const BASE_SCALE = 96 / 2.54

export const clampScale = (scale: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))

export const zoomPercent = (scale: number) => Math.round((scale / BASE_SCALE) * 100)

export function worldToScreen(p: Point, vp: Viewport): Point {
  return { x: p.x * vp.scale + vp.x, y: p.y * vp.scale + vp.y }
}

export function screenToWorld(p: Point, vp: Viewport): Point {
  return { x: (p.x - vp.x) / vp.scale, y: (p.y - vp.y) / vp.scale }
}

/** Zooms by `factor` while keeping the world point under `screenPoint` where it is. */
export function zoomAt(vp: Viewport, screenPoint: Point, factor: number): Viewport {
  const scale = clampScale(vp.scale * factor)
  const anchor = screenToWorld(screenPoint, vp)
  return { scale, x: screenPoint.x - anchor.x * scale, y: screenPoint.y - anchor.y * scale }
}

export function panBy(vp: Viewport, dx: number, dy: number): Viewport {
  return { ...vp, x: vp.x + dx, y: vp.y + dy }
}

/** The viewport that shows `bounds` centred, with `padding` pixels to spare on every side. */
export function fitBounds(bounds: Bounds, size: Size, padding = 48): Viewport {
  const width = Math.max(bounds.maxX - bounds.minX, 0.01)
  const height = Math.max(bounds.maxY - bounds.minY, 0.01)
  const availableWidth = Math.max(size.width - 2 * padding, 1)
  const availableHeight = Math.max(size.height - 2 * padding, 1)
  const scale = clampScale(Math.min(availableWidth / width, availableHeight / height))
  const centre = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }
  return { scale, x: size.width / 2 - centre.x * scale, y: size.height / 2 - centre.y * scale }
}

/** The part of the world that is visible on screen. */
export function visibleBounds(vp: Viewport, size: Size): Bounds {
  const topLeft = screenToWorld({ x: 0, y: 0 }, vp)
  const bottomRight = screenToWorld({ x: size.width, y: size.height }, vp)
  return { minX: topLeft.x, minY: topLeft.y, maxX: bottomRight.x, maxY: bottomRight.y }
}

/** Wheel deltas in pixels: Firefox may report lines (deltaMode 1) or pages (deltaMode 2). */
export function wheelDeltaPx(delta: number, deltaMode: number): number {
  return deltaMode === 1 ? delta * 33 : deltaMode === 2 ? delta * 800 : delta
}

/**
 * Zoom factor for a wheel event. Pinch gestures on trackpads arrive as ctrl+wheel with small
 * deltas, so they get a stronger factor per unit.
 */
export function wheelZoomFactor(deltaY: number, isPinch: boolean): number {
  return Math.exp(-deltaY * (isPinch ? 0.01 : 0.0015))
}

/**
 * Trackpads scroll with small, often horizontal deltas; mouse wheels jump in big vertical steps.
 * Plain trackpad scrolling pans; a mouse wheel (or a pinch) zooms.
 */
export function isTrackpadPan(e: {
  deltaX: number
  deltaY: number
  deltaMode: number
  ctrlKey: boolean
  metaKey: boolean
}): boolean {
  if (e.ctrlKey || e.metaKey) return false
  return e.deltaMode === 0 && (e.deltaX !== 0 || Math.abs(e.deltaY) < 40)
}
