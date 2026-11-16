import type { Point } from '../../../model/schema'
import { PLANTING_MARKS } from '../../../styles/elementStyles'
import { GHOST_STYLE, type PlantAppearance } from '../../../styles/plantAppearance'

/**
 * Drawing plants with the canvas API, for Konva `sceneFunc`s: the symbols are SVG paths (see
 * plantSymbols.ts), drawn as Path2D. Sizes that should stay the same on screen (outlines, badges,
 * labels) are given in pixels and converted with `pxPerM`, the current zoom, so zooming never
 * has to re-render React components.
 */

/** Below this radius on screen a plant is drawn as a plain disc (less detail when zoomed out). */
export const SIMPLE_SYMBOL_RADIUS_PX = 7
/** Plants are never drawn smaller than this, so they don't vanish when zoomed far out. */
const MIN_RADIUS_PX = 1.5

const paths = new Map<string, Path2D>()
function path(d: string): Path2D {
  let p = paths.get(d)
  if (!p) {
    p = new Path2D(d)
    paths.set(d, p)
  }
  return p
}

/** "#rrggbb" + an opacity → "rgba(r, g, b, a)". */
export function withAlpha(hex: string, alpha: number): string {
  const value = parseInt(hex.slice(1), 16)
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`
}

/** The radius a plant is drawn with, in metres (at least MIN_RADIUS_PX on screen). */
export function drawnRadius(radiusM: number, pxPerM: number): number {
  return Math.max(radiusM, MIN_RADIUS_PX / pxPerM)
}

/**
 * Draws a plant's symbol centred on `at`, `radius` metres in size. A ghost (not planted yet in the
 * viewed year) is drawn see-through with a dashed outline.
 */
export function drawPlantSymbol(
  ctx: CanvasRenderingContext2D,
  appearance: PlantAppearance,
  at: Point,
  radius: number,
  pxPerM: number,
): void {
  if (!appearance.ghost) {
    drawSymbol(ctx, appearance, at, radius, pxPerM)
    return
  }
  ctx.save()
  ctx.globalAlpha *= GHOST_STYLE.opacity
  drawSymbol(ctx, appearance, at, radius, pxPerM)
  ctx.restore()
  ctx.save()
  ctx.beginPath()
  ctx.arc(at.x, at.y, drawnRadius(radius, pxPerM), 0, 2 * Math.PI)
  ctx.setLineDash(GHOST_STYLE.dashPx.map((d) => d / pxPerM))
  ctx.lineWidth = 1 / pxPerM
  ctx.strokeStyle = GHOST_STYLE.ring
  ctx.stroke()
  ctx.restore()
}

function drawSymbol(
  ctx: CanvasRenderingContext2D,
  appearance: PlantAppearance,
  at: Point,
  radius: number,
  pxPerM: number,
): void {
  const r = drawnRadius(radius, pxPerM)
  if (r * pxPerM < SIMPLE_SYMBOL_RADIUS_PX) {
    ctx.beginPath()
    ctx.arc(at.x, at.y, r, 0, 2 * Math.PI)
    if (appearance.color) {
      ctx.fillStyle = appearance.color
      ctx.fill()
    }
    ctx.lineWidth = 1 / pxPerM
    ctx.strokeStyle = appearance.outline
    ctx.stroke()
    return
  }
  ctx.save()
  ctx.translate(at.x, at.y)
  ctx.scale(r, r)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const part of appearance.parts) {
    const p = path(part.d)
    if (part.fill) {
      ctx.fillStyle =
        part.fillOpacity === undefined ? part.fill : withAlpha(part.fill, part.fillOpacity)
      ctx.fill(p)
    }
    if (part.stroke) {
      ctx.strokeStyle = part.stroke
      ctx.lineWidth = (part.strokeWidth ?? 1) / (r * pxPerM)
      ctx.stroke(p)
    }
  }
  ctx.restore()
}

/** A ring just outside a selected plant. */
export function drawSelectionRing(
  ctx: CanvasRenderingContext2D,
  at: Point,
  radius: number,
  pxPerM: number,
): void {
  const r = drawnRadius(radius, pxPerM) + 2 / pxPerM
  ctx.beginPath()
  ctx.arc(at.x, at.y, r, 0, 2 * Math.PI)
  ctx.lineWidth = PLANTING_MARKS.selectionWidthPx / pxPerM
  ctx.strokeStyle = PLANTING_MARKS.selectionColor
  ctx.stroke()
}

/** Below this radius on screen a warning is a coloured ring instead of a "!" badge. */
const BADGE_MIN_RADIUS_PX = 8

/**
 * A red "!" badge at the plant's top right for a warning. A notice (e.g. needs watering on sand)
 * gets an amber ring, and so does a warning on a plant too small for a badge: a bed full of
 * lettuce shouldn't disappear under badges.
 */
export function drawWarningBadge(
  ctx: CanvasRenderingContext2D,
  at: Point,
  radius: number,
  pxPerM: number,
  severity: 'warning' | 'notice',
): void {
  const px = 1 / pxPerM
  const color = severity === 'warning' ? PLANTING_MARKS.warningColor : PLANTING_MARKS.noticeColor
  const r = drawnRadius(radius, pxPerM)
  if (severity === 'notice' || r * pxPerM < BADGE_MIN_RADIUS_PX) {
    ctx.beginPath()
    ctx.arc(at.x, at.y, r + px, 0, 2 * Math.PI)
    ctx.lineWidth = 1.5 * px
    ctx.strokeStyle = color
    ctx.stroke()
    return
  }
  const size = PLANTING_MARKS.warningSizePx * px
  const offset = Math.max(r * 0.71, size * 0.45)
  const x = at.x + offset
  const y = at.y - offset
  ctx.beginPath()
  ctx.arc(x, y, size / 2, 0, 2 * Math.PI)
  ctx.fillStyle = color
  ctx.fill()
  ctx.lineWidth = 1.5 * px
  ctx.strokeStyle = '#ffffff'
  ctx.stroke()
  // The "!": a bar and a dot.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(x - 0.9 * px, y - size * 0.3, 1.8 * px, size * 0.36)
  ctx.beginPath()
  ctx.arc(x, y + size * 0.22, 1.1 * px, 0, 2 * Math.PI)
  ctx.fill()
}

const widths = new Map<string, number>()

/** Width of a label in pixels (measured once per text and font). */
export function labelWidthPx(ctx: CanvasRenderingContext2D, text: string, bold = false): number {
  const font = labelFont(bold)
  const key = `${font}|${text}`
  let width = widths.get(key)
  if (width === undefined) {
    ctx.save()
    ctx.font = font
    width = ctx.measureText(text).width
    ctx.restore()
    widths.set(key, width)
  }
  return width
}

const labelFont = (bold: boolean) =>
  `${bold ? '600 ' : ''}${PLANTING_MARKS.labelFontPx}px system-ui, sans-serif`

/** A label with a white halo, centred horizontally on `at` (font size in pixels). */
export function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  at: Point,
  pxPerM: number,
  options: { bold?: boolean; baseline?: CanvasTextBaseline } = {},
): void {
  ctx.save()
  ctx.translate(at.x, at.y)
  ctx.scale(1 / pxPerM, 1 / pxPerM)
  ctx.font = labelFont(!!options.bold)
  ctx.textAlign = 'center'
  ctx.textBaseline = options.baseline ?? 'top'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 3
  ctx.strokeStyle = PLANTING_MARKS.labelHalo
  ctx.strokeText(text, 0, 0)
  ctx.fillStyle = PLANTING_MARKS.labelColor
  ctx.fillText(text, 0, 0)
  ctx.restore()
}
