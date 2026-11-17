import type { Point } from '../model/schema'
import { angleDeg, direction, distance, roundPoint } from './polygon'

/**
 * Vegetable rows inside a bed (M15). The bed is a simple polygon, possibly concave. Rows run in a
 * direction given in map-style degrees (0° = right, 90° = up; y points down), `rowSpacingM` apart,
 * with plants `inRowSpacingM` apart along each row.
 *
 * Every plant gets a rectangle of row spacing × in-row spacing around it, and that rectangle stays
 * inside the bed: so the outer rows are half a row spacing from the edge, and the first and last
 * plant in a row half an in-row spacing (more where an edge runs at a slant). Rows and plants are
 * centred in the room that is left. In a concave bed a row can be split into several pieces.
 */

export type RowOptions = {
  /** Direction of the rows, map-style degrees (a row and its reverse are the same). */
  angleDeg: number
  rowSpacingM: number
  inRowSpacingM: number
  /** Stop after this many plant positions: a safety net against tiny spacings. */
  maxPositions?: number
  /** Stop after this many rows. */
  maxRows?: number
  /**
   * When set, rows are packed from max(this, the outline's near edge) instead of centred: the
   * first row lies half a row spacing beyond that line. -Infinity packs from the near edge.
   */
  startAcrossM?: number
}

/** A point's coordinate across the rows, in the frame layoutRows uses (increases with the row). */
export function acrossRows(p: Point, angleDeg: number): number {
  const v = direction(angleDeg - 90)
  return p.x * v.x + p.y * v.y
}

export type RowPiece = {
  /** Which row across the bed (0 = the first); the pieces of a split row share it. */
  row: number
  /**
   * Ends of the strip this piece of row can use: the row line, clipped to where a plant's
   * rectangle still fits inside the bed. Positions are centred between them.
   */
  start: Point
  end: Point
  /** Plant positions along the piece, from start to end. */
  positions: Point[]
}

export const DEFAULT_MAX_ROW_POSITIONS = 10_000

const EPSILON = 1e-9

type Interval = { lo: number; hi: number }

/** The rows and plant positions for a bed outline; empty when nothing fits. */
export function layoutRows(outline: readonly Point[], options: RowOptions): RowPiece[] {
  const { rowSpacingM, inRowSpacingM } = options
  const maxPositions = options.maxPositions ?? DEFAULT_MAX_ROW_POSITIONS
  if (outline.length < 3 || !(rowSpacingM > 0) || !(inRowSpacingM > 0)) return []
  if (!Number.isFinite(options.angleDeg) || !(maxPositions > 0)) return []

  // A frame with s along the rows and r across them.
  const u = direction(options.angleDeg)
  const v = direction(options.angleDeg - 90)
  const points = outline.map((p) => ({ s: p.x * u.x + p.y * u.y, r: p.x * v.x + p.y * v.y }))
  const toWorld = (s: number, r: number) =>
    roundPoint({ x: s * u.x + r * v.x, y: s * u.y + r * v.y })

  const halfRow = rowSpacingM / 2
  const halfInRow = inRowSpacingM / 2
  let rMin = Infinity
  let rMax = -Infinity
  for (const { r } of points) {
    rMin = Math.min(rMin, r)
    rMax = Math.max(rMax, r)
  }
  const packed = options.startAcrossM !== undefined
  const rStart = Math.max(rMin, options.startAcrossM ?? rMin)
  const room = rMax - rStart - rowSpacingM
  if (room < -EPSILON) return []
  const fittingRows = Math.floor(room / rowSpacingM + EPSILON) + 1
  const firstRow = packed
    ? rStart + halfRow
    : rMin + halfRow + Math.max(0, room - (fittingRows - 1) * rowSpacingM) / 2
  const rowCount = Math.min(fittingRows, options.maxRows ?? Infinity, maxPositions)

  const edges = points.map((p, i) => [p, points[(i + 1) % points.length]!] as const)
  const pieces: RowPiece[] = []
  let positionCount = 0

  for (let row = 0; row < rowCount && positionCount < maxPositions; row++) {
    const r0 = firstRow + row * rowSpacingM

    // Where the row line is inside the bed (even-odd; half-open so a vertex counts once).
    const crossings: number[] = []
    for (const [p, q] of edges) {
      if (p.r > r0 !== q.r > r0) crossings.push(p.s + ((r0 - p.r) / (q.r - p.r)) * (q.s - p.s))
    }
    crossings.sort((a, b) => a - b)
    const inside: Interval[] = []
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      inside.push({ lo: crossings[i]!, hi: crossings[i + 1]! })
    }

    // Where a plant's rectangle would overlap an edge: each edge's part inside the row's band,
    // widened by half the in-row spacing. Open intervals, slightly shrunk, so touching is fine.
    const bandLo = r0 - halfRow + EPSILON
    const bandHi = r0 + halfRow - EPSILON
    const blocked: Interval[] = []
    for (const [p, q] of edges) {
      const range = edgeRangeInBand(p, q, bandLo, bandHi)
      if (range)
        blocked.push({ lo: range.lo - halfInRow + EPSILON, hi: range.hi + halfInRow - EPSILON })
    }

    for (const free of subtract(inside, blocked)) {
      if (positionCount >= maxPositions) break
      const length = Math.max(0, free.hi - free.lo)
      const count = Math.min(
        Math.floor(length / inRowSpacingM + EPSILON) + 1,
        maxPositions - positionCount,
      )
      const first = free.lo + Math.max(0, length - (count - 1) * inRowSpacingM) / 2
      const positions = Array.from({ length: count }, (_, i) =>
        toWorld(first + i * inRowSpacingM, r0),
      )
      positionCount += count
      pieces.push({
        row,
        start: toWorld(free.lo - halfInRow, r0),
        end: toWorld(free.hi + halfInRow, r0),
        positions,
      })
    }
  }
  return pieces
}

/** All plant positions of a row layout, row by row. */
export function rowPositions(pieces: readonly RowPiece[]): Point[] {
  return pieces.flatMap((piece) => piece.positions)
}

/** The s-range of the part of edge pq with lo < r < hi, or null when it has no such part. */
function edgeRangeInBand(
  p: { s: number; r: number },
  q: { s: number; r: number },
  lo: number,
  hi: number,
): Interval | null {
  let tEnter = 0
  let tExit = 1
  const dr = q.r - p.r
  if (dr === 0) {
    if (!(p.r > lo && p.r < hi)) return null
  } else {
    const t1 = (lo - p.r) / dr
    const t2 = (hi - p.r) / dr
    tEnter = Math.max(0, Math.min(t1, t2))
    tExit = Math.min(1, Math.max(t1, t2))
    if (!(tEnter < tExit)) return null
  }
  const s1 = p.s + tEnter * (q.s - p.s)
  const s2 = p.s + tExit * (q.s - p.s)
  return { lo: Math.min(s1, s2), hi: Math.max(s1, s2) }
}

/** Closed intervals of `ranges` minus the open intervals `cuts`. */
function subtract(ranges: readonly Interval[], cuts: readonly Interval[]): Interval[] {
  const sorted = [...cuts].sort((a, b) => a.lo - b.lo)
  const result: Interval[] = []
  for (const range of ranges) {
    let cursor = range.lo
    for (const cut of sorted) {
      if (cut.hi <= cursor) continue
      if (cut.lo >= range.hi) break
      if (cut.lo >= cursor) result.push({ lo: cursor, hi: cut.lo })
      cursor = cut.hi
      if (cursor >= range.hi) break
    }
    if (cursor <= range.hi) result.push({ lo: cursor, hi: range.hi })
  }
  return result
}

/** A row direction normalised to [0, 180): rows have no front or back. */
export function normaliseRowAngle(degrees: number): number {
  const angle = ((degrees % 180) + 180) % 180
  const rounded = Math.round(angle * 1e6) / 1e6
  return rounded >= 180 ? 0 : rounded
}

/** The default row direction for a bed: along its longest edge, in [0, 180). */
export function defaultRowAngle(outline: readonly Point[]): number {
  let best = 0
  let longest = 0
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!
    const b = outline[(i + 1) % outline.length]!
    const length = distance(a, b)
    if (length > longest + EPSILON) {
      longest = length
      best = angleDeg(a, b)
    }
  }
  return normaliseRowAngle(best)
}
