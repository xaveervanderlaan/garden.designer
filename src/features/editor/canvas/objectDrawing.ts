import type Konva from 'konva'
import { longestEdgeAngle } from '../../../geometry/planting'
import type { Point } from '../../../model/schema'
import {
  DEFAULT_STROKE_PX,
  type ElementPattern,
  type ElementStyle,
  EXISTING_STYLE,
  PATTERN_MIN_SPACING_PX,
  SELECTION_COLOR,
} from '../../../styles/elementStyles'

/**
 * Drawing outline objects (beds, structures, later surfaces) with the canvas API, for Konva
 * `sceneFunc`s. Points are in the shape's own coordinates (metres); sizes meant for the screen
 * (outlines, pattern lines, dashes) are given in pixels and divided by `pxPerM`, the zoom at draw
 * time, so zooming never re-renders React components.
 */

export function tracePolygon(
  ctx: CanvasRenderingContext2D | Konva.Context,
  points: readonly Point[],
): void {
  ctx.beginPath()
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
  ctx.closePath()
}

type Box = { minX: number; minY: number; maxX: number; maxY: number }

function boxOf(points: readonly Point[]): Box {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  return { minX, minY, maxX, maxY }
}

/** The pattern's spacing, doubled until its lines are at least PATTERN_MIN_SPACING_PX apart. */
export function readableSpacing(spacingM: number, pxPerM: number): number {
  let spacing = spacingM
  if (!(spacing > 0) || !(pxPerM > 0)) return Infinity
  while (spacing * pxPerM < PATTERN_MIN_SPACING_PX) spacing *= 2
  return spacing
}

/** Parallel lines across the polygon, `spacing` apart, along its longest edge. */
function drawRows(ctx: CanvasRenderingContext2D, points: readonly Point[], spacing: number) {
  const angle = longestEdgeAngle(points)
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  // Coordinates along (u) and across (v) the rows.
  const us = points.map((p) => p.x * cos + p.y * sin)
  const vs = points.map((p) => -p.x * sin + p.y * cos)
  const minU = Math.min(...us)
  const maxU = Math.max(...us)
  const maxV = Math.max(...vs)
  for (let v = Math.min(...vs) + spacing / 2; v < maxV; v += spacing) {
    ctx.moveTo(minU * cos - v * sin, minU * sin + v * cos)
    ctx.lineTo(maxU * cos - v * sin, maxU * sin + v * cos)
  }
}

function drawHatch(ctx: CanvasRenderingContext2D, box: Box, spacing: number, angleDeg: number) {
  const a = (angleDeg * Math.PI) / 180
  const d = { x: Math.cos(a), y: Math.sin(a) }
  const n = { x: -d.y, y: d.x }
  const c = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 }
  const reach = Math.hypot(box.maxX - box.minX, box.maxY - box.minY) / 2
  // Lines through the centre and every `spacing` from it, so the hatch moves with the object.
  for (let k = -Math.floor(reach / spacing); k * spacing <= reach; k++) {
    const o = { x: c.x + n.x * k * spacing, y: c.y + n.y * k * spacing }
    ctx.moveTo(o.x - d.x * reach, o.y - d.y * reach)
    ctx.lineTo(o.x + d.x * reach, o.y + d.y * reach)
  }
}

function drawLinesAcross(
  ctx: CanvasRenderingContext2D,
  box: Box,
  spacing: number,
  axis: 'x' | 'y',
) {
  if (axis === 'x') {
    for (let x = box.minX + spacing; x < box.maxX - 1e-9; x += spacing) {
      ctx.moveTo(x, box.minY)
      ctx.lineTo(x, box.maxY)
    }
  } else {
    for (let y = box.minY + spacing; y < box.maxY - 1e-9; y += spacing) {
      ctx.moveTo(box.minX, y)
      ctx.lineTo(box.maxX, y)
    }
  }
}

/** Draws a pattern inside the polygon (clipping is up to the caller). */
export function drawPattern(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  pattern: ElementPattern,
  pxPerM: number,
): void {
  const px = 1 / pxPerM
  const box = boxOf(points)
  ctx.beginPath()
  switch (pattern.kind) {
    case 'rows':
      // Rows closer than a few pixels would only make the bed look grey.
      if (pattern.spacingM * pxPerM < PATTERN_MIN_SPACING_PX) return
      drawRows(ctx, points, pattern.spacingM)
      break
    case 'hatch':
      drawHatch(ctx, box, readableSpacing(pattern.spacingM, pxPerM), pattern.angleDeg)
      break
    case 'grid': {
      const spacing = readableSpacing(pattern.spacingM, pxPerM)
      drawLinesAcross(ctx, box, spacing, 'x')
      drawLinesAcross(ctx, box, spacing, 'y')
      break
    }
    case 'beams': {
      // Beams span the short side, so they are spaced along the long one.
      const along = box.maxX - box.minX >= box.maxY - box.minY ? 'x' : 'y'
      drawLinesAcross(ctx, box, readableSpacing(pattern.spacingM, pxPerM), along)
      break
    }
    case 'cross':
      ctx.moveTo(box.minX, box.minY)
      ctx.lineTo(box.maxX, box.maxY)
      ctx.moveTo(box.maxX, box.minY)
      ctx.lineTo(box.minX, box.maxY)
      break
  }
  ctx.strokeStyle = pattern.color
  ctx.lineWidth = ('widthPx' in pattern ? (pattern.widthPx ?? 1) : 1) * px
  ctx.lineCap = 'butt'
  ctx.stroke()
}

export type OutlineLook = {
  selected: boolean
  /** Already there: drawn muted, with a dashed outline. */
  existing: boolean
}

/** Fill, pattern and outline of an outline object (a bed, a building). */
export function drawOutlineObject(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  style: ElementStyle,
  look: OutlineLook,
  pxPerM: number,
): void {
  if (points.length < 3) return
  const px = 1 / pxPerM
  ctx.save()
  if (look.existing) ctx.globalAlpha = EXISTING_STYLE.fillOpacity
  tracePolygon(ctx, points)
  ctx.fillStyle = style.fill
  ctx.fill()
  if (style.pattern) {
    ctx.save()
    tracePolygon(ctx, points)
    ctx.clip()
    drawPattern(ctx, points, style.pattern, pxPerM)
    ctx.restore()
  }
  ctx.restore()

  ctx.save()
  tracePolygon(ctx, points)
  ctx.lineJoin = 'round'
  if (look.existing && !look.selected) ctx.setLineDash(EXISTING_STYLE.dashPx.map((d) => d * px))
  ctx.strokeStyle = look.selected ? SELECTION_COLOR : style.stroke
  ctx.lineWidth = (look.selected ? 2.5 : (style.strokeWidthPx ?? DEFAULT_STROKE_PX)) * px
  ctx.stroke()
  ctx.restore()
}
