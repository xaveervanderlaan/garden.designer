import type { RectMm } from './scale'

export type PointMm = { x: number; y: number }

const REPLACEMENTS: Record<string, string> = {
  '–': '-',
  '—': '-',
  '‘': "'",
  '’': "'",
  '“': '"',
  '”': '"',
  '…': '...',
  '≥': '>=',
  '≤': '<=',
}

/**
 * Text for jsPDF's built-in Helvetica (WinAnsi): Latin-1 is kept, common typographic characters
 * get a plain equivalent and anything else becomes "?".
 */
export function pdfText(text: string): string {
  let out = ''
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    out += code <= 0xff ? ch : (REPLACEMENTS[ch] ?? '?')
  }
  return out
}

/** Where the parts of the title block go (mm on the page). */
export function titleBlockLayout(block: RectMm): {
  name: PointMm
  lines: PointMm[]
  scaleBar: { xMm: number; yMm: number; maxWidthMm: number }
  north: { cx: number; cy: number; rMm: number }
} {
  const pad = 2
  const rMm = Math.min(block.heightMm / 2 - pad, 6)
  const northCx = block.xMm + block.widthMm - pad - rMm
  const barWidth = Math.min(50, block.widthMm * 0.25)
  const barX = northCx - rMm - 8 - barWidth
  return {
    name: { x: block.xMm + pad, y: block.yMm + 5.5 },
    lines: [
      { x: block.xMm + pad, y: block.yMm + 9.5 },
      { x: block.xMm + pad, y: block.yMm + 13 },
    ],
    scaleBar: { xMm: barX, yMm: block.yMm + block.heightMm - 6, maxWidthMm: barWidth },
    north: { cx: northCx, cy: block.yMm + block.heightMm / 2, rMm },
  }
}

/**
 * A north arrow: the tip points to north, which lies `northAngleDeg` clockwise from straight up
 * (like on the plan). `left`/`right` are the base corners, `label` is where the "N" goes.
 */
export function northArrowShape(
  cx: number,
  cy: number,
  r: number,
  northAngleDeg: number,
): { tip: PointMm; left: PointMm; right: PointMm; label: PointMm } {
  const a = (northAngleDeg * Math.PI) / 180
  const at = (dist: number, offset: number): PointMm => ({
    x: cx + dist * Math.sin(a + offset),
    y: cy - dist * Math.cos(a + offset),
  })
  const back = (3 * Math.PI) / 4
  return {
    tip: at(r, 0),
    left: at(r * 0.7, -back),
    right: at(r * 0.7, back),
    label: at(r * 1.35, 0),
  }
}

/**
 * Puts blocks of the given heights one under the other, starting at `firstYMm` on page 0. A block
 * that doesn't fit before `page.bottomMm` moves to the top of the next page.
 */
export function flow(
  heightsMm: number[],
  firstYMm: number,
  page: { topMm: number; bottomMm: number },
): { page: number; yMm: number }[] {
  let pageIndex = 0
  let y = firstYMm
  return heightsMm.map((height) => {
    if (y + height > page.bottomMm && y > page.topMm) {
      pageIndex += 1
      y = page.topMm
    }
    const placed = { page: pageIndex, yMm: y }
    y += height
    return placed
  })
}

/** How many 60 mm legend columns fit in `widthMm` (at least 1). */
export const legendColumns = (widthMm: number) => Math.max(1, Math.floor(widthMm / 60))

export const LIST_MARGIN_MM = 10
const FOOTER_MM = 10
export const LEGEND_ROW_MM = 8
export const TABLE_ROW_MM = 6

export type ListLayout = {
  /** Legend: heading at `yMm`, entries in `columns` columns of `columnMm` below it. */
  legend: { yMm: number; columns: number; columnMm: number; firstRowYMm: number }
  /** The planting list heading and its column header row. */
  table: { page: number; yMm: number }
  rows: { page: number; yMm: number }[]
  total: { page: number; yMm: number }
  pageCount: number
}

/**
 * Where the legend and the planting list go on the portrait pages after the plan: the legend
 * first (heading + entries in columns), then the table, which breaks to a new page when full.
 */
export function listLayout(
  entryCount: number,
  rowCount: number,
  pageMm: { widthMm: number; heightMm: number },
): ListLayout {
  const columns = legendColumns(pageMm.widthMm - 2 * LIST_MARGIN_MM)
  const columnMm = (pageMm.widthMm - 2 * LIST_MARGIN_MM) / columns
  const legendRows = Math.ceil(entryCount / columns)
  const legendHeight = entryCount === 0 ? 0 : 8 + legendRows * LEGEND_ROW_MM + 6
  const tableHeight = 8 + TABLE_ROW_MM + 1
  const placed = flow(
    [legendHeight, tableHeight, ...Array<number>(rowCount).fill(TABLE_ROW_MM), TABLE_ROW_MM + 2],
    LIST_MARGIN_MM,
    { topMm: LIST_MARGIN_MM, bottomMm: pageMm.heightMm - FOOTER_MM },
  )
  const [legend, table, ...rest] = placed as [
    { page: number; yMm: number },
    { page: number; yMm: number },
    ...{ page: number; yMm: number }[],
  ]
  const total = rest.pop()!
  return {
    legend: { yMm: legend.yMm, columns, columnMm, firstRowYMm: legend.yMm + 8 },
    table,
    rows: rest,
    total,
    pageCount: Math.max(legend.page, total.page) + 1,
  }
}
