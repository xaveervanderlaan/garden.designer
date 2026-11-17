import { type Bounds, DEFAULT_VIEW_BOUNDS, projectBounds } from '../geometry/bounds'
import type { Size, Viewport } from '../geometry/viewport'
import { BACKGROUND_LAYER, backgroundBounds } from '../model/background'
import { isLayerVisible } from '../model/edit'
import type { Project } from '../model/schema'
import { fileSlug } from '../persistence/gardenFile'
import {
  type Orientation,
  type PaperSize,
  PRINT_DPI,
  type PrintScale,
  type RectMm,
  type SizePx,
  bestOrientation,
  bestScale,
  boundsSizeM,
  fitsAtScale,
  imageSizePx,
  pxPerMetre,
} from './scale'

/**
 * The resolution the print is laid out at. Pixel-sized things (outlines, labels) keep their
 * on-screen size in layout pixels; the canvas is then rendered at `PRINT_DPI`, so 1 px is
 * 25.4 / 120 ≈ 0.21 mm on paper.
 */
export const PRINT_LAYOUT_DPI = 120

/** PNG sizes, as multiples of the plan area's size on screen. */
export const PNG_FACTORS = [1, 2, 3, 4] as const
export type PngFactor = (typeof PNG_FACTORS)[number]

/** The largest canvas we render (Safari's limit is 16,777,216 pixels). */
export const MAX_EXPORT_PIXELS = 16_777_216

/**
 * The area to export as "the whole plan": what zoom to fit shows. The site plan only counts when
 * there is nothing else (and only when it's visible); an empty design shows the default view.
 */
export function designBounds(project: Project): Bounds {
  const sitePlan = isLayerVisible(project, BACKGROUND_LAYER) ? backgroundBounds(project) : null
  return projectBounds(project) ?? sitePlan ?? DEFAULT_VIEW_BOUNDS
}

/**
 * How to render `world` (the printed area, see `printedWorldBounds`) onto a page's plan area at
 * 1:scale: a viewport and stage size in layout pixels, and the pixel ratio that brings the canvas
 * to the 300 dpi plan image.
 */
export function printViewport(
  world: Bounds,
  plan: RectMm,
  scale: PrintScale,
): { viewport: Viewport; size: Size; pixelRatio: number } {
  const pixelRatio = PRINT_DPI / PRINT_LAYOUT_DPI
  const image = imageSizePx(plan)
  const pxPerM = pxPerMetre(scale, PRINT_LAYOUT_DPI)
  return {
    viewport: { x: -world.minX * pxPerM, y: -world.minY * pxPerM, scale: pxPerM },
    size: { width: image.widthPx / pixelRatio, height: image.heightPx / pixelRatio },
    pixelRatio,
  }
}

/** The pixel size of a PNG `factor` times the plan area's size on screen. */
export function pngSize(canvas: Size, factor: number): SizePx {
  return {
    widthPx: Math.floor(canvas.width * factor),
    heightPx: Math.floor(canvas.height * factor),
  }
}

/** True when an image of this size is too big to render. */
export const tooManyPixels = ({ widthPx, heightPx }: SizePx) =>
  widthPx * heightPx > MAX_EXPORT_PIXELS

/** The suggested orientation and scale for a plan on a paper size, and whether it fits. */
export function pdfDefaults(
  bounds: Bounds,
  paper: PaperSize,
): { orientation: Orientation; scale: PrintScale; fits: boolean } {
  const size = boundsSizeM(bounds)
  const orientation = bestOrientation(size, paper)
  const scale = bestScale(size, paper, orientation) ?? 200
  return { orientation, scale, fits: fitsAtScale(size, paper, orientation, scale) }
}

export const pdfFileName = (name: string, paper: PaperSize, scale: PrintScale) =>
  `${fileSlug(name)}-${paper.toLowerCase()}-1-${scale}.pdf`

export const pngFileName = (name: string) => `${fileSlug(name)}-plan.png`
