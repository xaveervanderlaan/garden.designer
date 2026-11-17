import type Konva from 'konva'
import { longestEdgeAngle } from '../../../geometry/planting'
import type { SymbolVariant } from '../../../model/objectKinds'
import type { ObjectKind, Point } from '../../../model/schema'
import {
  BOUNDARY_LOOKS,
  type BoundaryKind,
  DEFAULT_STROKE_PX,
  DIMENSION_STYLE,
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

/**
 * Parallel lines across the polygon, `spacing` apart: in the direction `angleDeg` (map-style
 * degrees), else along its longest edge.
 */
export function drawRows(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  spacing: number,
  angleDeg?: number,
) {
  // Map-style angles turn anticlockwise; on screen (y down) that is a negative angle.
  const angle = angleDeg === undefined ? longestEdgeAngle(points) : (-angleDeg * Math.PI) / 180
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

/** Staggered rows of dots, `spacing` apart; every other row shifted by half. */
function drawDots(ctx: CanvasRenderingContext2D, box: Box, spacing: number, radius: number) {
  const rowStep = spacing * 0.866
  let row = 0
  for (let y = box.minY + rowStep / 2; y < box.maxY; y += rowStep, row++) {
    const start = box.minX + (row % 2 === 0 ? spacing / 4 : (spacing * 3) / 4)
    for (let x = start; x < box.maxX; x += spacing) {
      ctx.moveTo(x + radius, y)
      ctx.arc(x, y, radius, 0, Math.PI * 2)
    }
  }
}

/** Courses along x, `width` apart, with joints every `length`, offset by half every other course. */
function drawBond(ctx: CanvasRenderingContext2D, box: Box, length: number, width: number) {
  drawLinesAcross(ctx, box, width, 'y')
  let course = 0
  for (let y = box.minY; y < box.maxY - 1e-9; y += width, course++) {
    const bottom = Math.min(y + width, box.maxY)
    const start = box.minX + (course % 2 === 0 ? length : length / 2)
    for (let x = start; x < box.maxX - 1e-9; x += length) {
      ctx.moveTo(x, y)
      ctx.lineTo(x, bottom)
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
      drawRows(ctx, points, pattern.spacingM, pattern.angleDeg)
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
    case 'dots':
      drawDots(ctx, box, readableSpacing(pattern.spacingM, pxPerM), (pattern.radiusPx ?? 1) * px)
      ctx.fillStyle = pattern.color
      ctx.fill()
      return
    case 'bond': {
      const width = readableSpacing(pattern.widthM, pxPerM)
      drawBond(ctx, box, pattern.lengthM * (width / pattern.widthM), width)
      break
    }
    case 'planks': {
      // Planks run along the long side, so the joints between them are spaced across it.
      const across = box.maxX - box.minX >= box.maxY - box.minY ? 'y' : 'x'
      drawLinesAcross(ctx, box, readableSpacing(pattern.spacingM, pxPerM), across)
      break
    }
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

/**
 * Fence posts along a polyline: at its ends and corners, and in between evenly spaced at most
 * `maxSpacingM` apart. Without a spacing: only the ends and corners.
 */
export function postPositions(points: readonly Point[], maxSpacingM?: number): Point[] {
  const posts: Point[] = []
  points.forEach((p, i) => {
    const prev = points[i - 1]
    if (prev && maxSpacingM && maxSpacingM > 0) {
      const length = Math.hypot(p.x - prev.x, p.y - prev.y)
      const n = Math.ceil(length / maxSpacingM - 1e-9)
      for (let k = 1; k < n; k++) {
        posts.push({ x: prev.x + ((p.x - prev.x) * k) / n, y: prev.y + ((p.y - prev.y) * k) / n })
      }
    }
    const last = posts[posts.length - 1]
    if (!last || last.x !== p.x || last.y !== p.y) posts.push({ x: p.x, y: p.y })
  })
  return posts
}

function tracePolyline(ctx: CanvasRenderingContext2D, points: readonly Point[]) {
  ctx.beginPath()
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
}

const isBoundary = (kind: ObjectKind): kind is BoundaryKind => kind in BOUNDARY_LOOKS

/**
 * A fence, wall, hedge or gate as a band of its real thickness (at least a few pixels wide on
 * screen), with posts or darker edges; a selection halo underneath when selected.
 */
export function drawBoundary(
  ctx: CanvasRenderingContext2D,
  kind: ObjectKind,
  points: readonly Point[],
  thicknessM: number,
  style: ElementStyle,
  look: OutlineLook,
  pxPerM: number,
): void {
  if (points.length < 2) return
  const px = 1 / pxPerM
  const boundary = isBoundary(kind) ? BOUNDARY_LOOKS[kind] : BOUNDARY_LOOKS.fence
  const width = Math.max(thicknessM, boundary.minWidthPx * px)
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = kind === 'hedge' ? 'round' : 'butt'
  if (look.selected) {
    tracePolyline(ctx, points)
    ctx.strokeStyle = SELECTION_COLOR
    ctx.lineWidth = width + 5 * px
    ctx.stroke()
  }
  if (look.existing) ctx.globalAlpha = EXISTING_STYLE.fillOpacity
  tracePolyline(ctx, points)
  if (boundary.edge && width > 4 * px) {
    // Darker edges: the band in the edge colour, then the fill a pixel narrower on each side.
    ctx.strokeStyle = boundary.edge
    ctx.lineWidth = width
    ctx.stroke()
    ctx.strokeStyle = style.fill
    ctx.lineWidth = width - 2 * px
    ctx.stroke()
  } else {
    if (boundary.dashPx) ctx.setLineDash(boundary.dashPx.map((d) => d * px))
    ctx.strokeStyle = style.fill
    ctx.lineWidth = width
    ctx.stroke()
    ctx.setLineDash([])
  }
  if (boundary.postSizeM) {
    const size = Math.max(boundary.postSizeM, width * 1.6)
    ctx.beginPath()
    for (const p of postPositions(points, boundary.postSpacingM)) {
      ctx.rect(p.x - size / 2, p.y - size / 2, size, size)
    }
    ctx.fillStyle = style.stroke
    ctx.fill()
  }
  ctx.restore()
}

/** Unit vector from a to b (zero when they coincide). */
function unit(a: Point, b: Point): Point {
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  return length > 1e-12 ? { x: (b.x - a.x) / length, y: (b.y - a.y) / length } : { x: 0, y: 0 }
}

/**
 * A dimension (a kept measurement): a thin line with a perpendicular tick at every vertex and each
 * segment's length at its middle, reading left to right on screen. A length is left out when its
 * segment is shorter on screen than the text.
 */
export function drawDimension(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  pxPerM: number,
  look: { selected: boolean },
  formatLength: (metres: number) => string,
): void {
  if (points.length < 2) return
  const px = 1 / pxPerM
  const { color, widthPx, tickPx, fontPx } = DIMENSION_STYLE
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'butt'
  if (look.selected) {
    tracePolyline(ctx, points)
    ctx.strokeStyle = SELECTION_COLOR
    ctx.lineWidth = (widthPx + 5) * px
    ctx.stroke()
  }
  ctx.beginPath()
  points.forEach((p, i) => {
    // Perpendicular to the line there (the average direction at a bend).
    const into = i > 0 ? unit(points[i - 1]!, p) : { x: 0, y: 0 }
    const out = i < points.length - 1 ? unit(p, points[i + 1]!) : { x: 0, y: 0 }
    const along = unit({ x: 0, y: 0 }, { x: into.x + out.x, y: into.y + out.y })
    const dir = along.x === 0 && along.y === 0 ? (i > 0 ? into : out) : along
    const half = (tickPx / 2) * px
    ctx.moveTo(p.x - dir.y * half, p.y + dir.x * half)
    ctx.lineTo(p.x + dir.y * half, p.y - dir.x * half)
  })
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
  ctx.strokeStyle = color
  ctx.lineWidth = widthPx * px
  ctx.stroke()

  const matrix = ctx.getTransform()
  ctx.font = `${fontPx}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.lineJoin = 'round'
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    const text = formatLength(length)
    if (length * pxPerM < ctx.measureText(text).width + tickPx * 2) continue
    // Flip the text when the segment points left on screen, so it never reads upside down.
    const screenDx = matrix.a * (b.x - a.x) + matrix.c * (b.y - a.y)
    const angle = Math.atan2(b.y - a.y, b.x - a.x) + (screenDx < -1e-9 ? Math.PI : 0)
    ctx.save()
    ctx.translate((a.x + b.x) / 2, (a.y + b.y) / 2)
    ctx.rotate(angle)
    ctx.scale(px, px)
    ctx.lineWidth = 3
    ctx.strokeStyle = '#ffffff'
    ctx.strokeText(text, 0, -2)
    ctx.fillStyle = color
    ctx.fillText(text, 0, -2)
    ctx.restore()
  }
  ctx.restore()
}

/** A symbol below this radius on screen gets no detail (only its filled shape). */
const SYMBOL_DETAIL_PX = 4

/**
 * A point object as a simple pictogram at its real size, axis-aligned around `at` (the group is
 * already turned by the object's rotation): its box or circle filled, with a few detail lines.
 */
export function drawSymbol(
  ctx: CanvasRenderingContext2D,
  kind: ObjectKind,
  symbol: SymbolVariant,
  at: Point,
  style: ElementStyle,
  look: OutlineLook,
  pxPerM: number,
): void {
  const px = 1 / pxPerM
  const w = symbol.widthM
  const d = symbol.depthM
  const r = w / 2
  const { x, y } = at
  const outline = (style.strokeWidthPx ?? DEFAULT_STROKE_PX) * px
  const rect = (cx: number, cy: number, rw: number, rd: number) =>
    ctx.rect(cx - rw / 2, cy - rd / 2, rw, rd)
  const circle = (radius: number) => {
    ctx.moveTo(x + radius, y)
    ctx.arc(x, y, radius, 0, Math.PI * 2)
  }
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.moveTo(x + x1, y + y1)
    ctx.lineTo(x + x2, y + y2)
  }
  const fillAndStroke = () => {
    ctx.fillStyle = style.fill
    ctx.fill()
    ctx.strokeStyle = style.stroke
    ctx.lineWidth = outline
    ctx.stroke()
  }

  ctx.save()
  if (look.existing) ctx.globalAlpha = EXISTING_STYLE.fillOpacity
  ctx.lineJoin = 'round'
  ctx.lineCap = 'butt'
  // A lamp is tiny: keep it visible when zoomed out.
  const shownR = kind === 'lighting' ? Math.max(r, 3 * px) : r
  const detail = Math.min(w, d) / 2 >= SYMBOL_DETAIL_PX * px

  // The base shape.
  ctx.beginPath()
  switch (symbol.id) {
    case 'dining-set': {
      // A table with two chairs on either long side.
      const chair = Math.min(w, d) * 0.22
      rect(x, y, w * 0.6, d * 0.45)
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1])
          rect(x + sx * w * 0.15, y + sy * (d / 2 - chair / 2), chair, chair)
      }
      break
    }
    case 'swing': {
      // Two seats under the beam; the frame is drawn as lines below.
      for (const sx of [-1, 1]) rect(x + sx * w * 0.17, y, w * 0.13, d * 0.14)
      break
    }
    default:
      if (symbol.round) circle(shownR)
      else rect(x, y, w, d)
  }
  fillAndStroke()

  // Details, in the outline colour.
  ctx.beginPath()
  if (detail || kind === 'lighting') {
    switch (symbol.id) {
      case 'bench':
      case 'lounger': {
        // Slats along the long side.
        for (const f of [-0.25, 0, 0.25]) line(-w / 2, d * f, w / 2, d * f)
        if (symbol.id === 'lounger') line(w * 0.3, -d / 2, w * 0.3, d / 2)
        break
      }
      case 'parasol':
        for (let k = 0; k < 8; k++) {
          const a = (k * Math.PI) / 4
          line(0, 0, Math.cos(a) * r, Math.sin(a) * r)
        }
        break
      case 'lamp':
        if (shownR * pxPerM >= SYMBOL_DETAIL_PX) {
          for (let k = 0; k < 8; k++) {
            const a = (k * Math.PI) / 4
            const c = Math.cos(a)
            const s = Math.sin(a)
            line(c * shownR * 1.3, s * shownR * 1.3, c * shownR * 1.9, s * shownR * 1.9)
          }
        }
        break
      case 'swing':
        // The beam and the A-frames at both ends.
        line(-w / 2, 0, w / 2, 0)
        line(-w / 2, -d / 2, -w / 2, d / 2)
        line(w / 2, -d / 2, w / 2, d / 2)
        break
      case 'sandbox': {
        const edge = Math.min(0.12, w / 6)
        rect(x, y, w - 2 * edge, d - 2 * edge)
        break
      }
      case 'trampoline':
        circle(r * 0.8)
        break
      case 'rain-barrel':
        circle(r * 0.75)
        break
      case 'playhouse':
        line(-w / 2, -d / 2, w / 2, d / 2)
        line(w / 2, -d / 2, -w / 2, d / 2)
        break
      case 'compost-bin':
        for (const f of [-0.25, 0, 0.25]) line(-w / 2, d * f, w / 2, d * f)
        break
      case 'dining-set':
        break
    }
  }
  ctx.strokeStyle = style.stroke
  ctx.lineWidth = px
  ctx.stroke()
  ctx.restore()

  if (look.selected) {
    ctx.save()
    ctx.beginPath()
    if (symbol.round) circle(shownR)
    else rect(x, y, w, d)
    ctx.strokeStyle = SELECTION_COLOR
    ctx.lineWidth = 2.5 * px
    ctx.stroke()
    ctx.restore()
  } else if (look.existing) {
    ctx.save()
    ctx.beginPath()
    if (symbol.round) circle(shownR)
    else rect(x, y, w, d)
    ctx.setLineDash(EXISTING_STYLE.dashPx.map((v) => v * px))
    ctx.strokeStyle = style.stroke
    ctx.lineWidth = outline
    ctx.stroke()
    ctx.restore()
  }
}
