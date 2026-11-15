import { type Bounds, boundsCentre } from '../geometry/bounds'

/**
 * Print scale maths for the PDF export (M16). Paper is measured in millimetres, the garden in
 * metres and the rendered image in pixels; a scale is the N of 1:N, so 1 mm on paper is N mm on
 * the ground. The page has a margin all round and a title block (name, date, scale bar, north
 * arrow, legend) along the bottom; the plan fills the rest. North is a separate setting, so the
 * plan is printed as drawn (not rotated).
 */

export const PAPER_SIZES = ['A4', 'A3'] as const
export type PaperSize = (typeof PAPER_SIZES)[number]

export const ORIENTATIONS = ['portrait', 'landscape'] as const
export type Orientation = (typeof ORIENTATIONS)[number]

export type SizeMm = { widthMm: number; heightMm: number }
export type SizeM = { widthM: number; heightM: number }
export type SizePx = { widthPx: number; heightPx: number }
/** A rectangle on the page, from its top-left corner. */
export type RectMm = { xMm: number; yMm: number; widthMm: number; heightMm: number }

/** ISO 216 sizes, portrait. */
export const PAPER_SIZES_MM: Record<PaperSize, SizeMm> = {
  A4: { widthMm: 210, heightMm: 297 },
  A3: { widthMm: 297, heightMm: 420 },
}

/** The offered scales, most detail first. */
export const PRINT_SCALES = [50, 100, 200] as const
export type PrintScale = (typeof PRINT_SCALES)[number]

/** Margin on every side; most printers can't print closer to the edge. */
export const PAGE_MARGIN_MM = 10
/** Height of the title block along the bottom of the printable area. */
export const TITLE_BLOCK_HEIGHT_MM = 15
/** Resolution the plan image is rendered at. */
export const PRINT_DPI = 300
export const MM_PER_INCH = 25.4

export function paperSizeMm(paper: PaperSize, orientation: Orientation): SizeMm {
  const { widthMm, heightMm } = PAPER_SIZES_MM[paper]
  return orientation === 'portrait'
    ? { widthMm, heightMm }
    : { widthMm: heightMm, heightMm: widthMm }
}

export type PageLayout = {
  page: SizeMm
  /** Where the plan is drawn. */
  plan: RectMm
  /** The title block below it, as wide as the plan. */
  titleBlock: RectMm
}

export type PageLayoutOptions = { marginMm?: number; titleBlockHeightMm?: number }

export function pageLayout(
  paper: PaperSize,
  orientation: Orientation,
  { marginMm = PAGE_MARGIN_MM, titleBlockHeightMm = TITLE_BLOCK_HEIGHT_MM }: PageLayoutOptions = {},
): PageLayout {
  const page = paperSizeMm(paper, orientation)
  const widthMm = Math.max(0, page.widthMm - 2 * marginMm)
  const planHeightMm = Math.max(0, page.heightMm - 2 * marginMm - titleBlockHeightMm)
  return {
    page,
    plan: { xMm: marginMm, yMm: marginMm, widthMm, heightMm: planHeightMm },
    titleBlock: {
      xMm: marginMm,
      yMm: marginMm + planHeightMm,
      widthMm,
      heightMm: Math.min(titleBlockHeightMm, Math.max(0, page.heightMm - 2 * marginMm)),
    },
  }
}

/** Length on the ground (m) of a length on paper (mm) at 1:scale. */
export const paperToGroundM = (lengthMm: number, scale: number) => (lengthMm * scale) / 1000
/** Length on paper (mm) of a length on the ground (m) at 1:scale. */
export const groundToPaperMm = (lengthM: number, scale: number) => (lengthM * 1000) / scale

/** The ground area the plan area of a page holds at a scale. */
export function planAreaM(
  paper: PaperSize,
  orientation: Orientation,
  scale: number,
  options?: PageLayoutOptions,
): SizeM {
  const { plan } = pageLayout(paper, orientation, options)
  return {
    widthM: paperToGroundM(plan.widthMm, scale),
    heightM: paperToGroundM(plan.heightMm, scale),
  }
}

export function boundsSizeM(bounds: Bounds): SizeM {
  return { widthM: bounds.maxX - bounds.minX, heightM: bounds.maxY - bounds.minY }
}

/** True when a plan of this size fits on the page at the scale (false → show a warning). */
export function fitsAtScale(
  plan: SizeM,
  paper: PaperSize,
  orientation: Orientation,
  scale: number,
  options?: PageLayoutOptions,
): boolean {
  const area = planAreaM(paper, orientation, scale, options)
  const tolerance = 1e-9
  return plan.widthM <= area.widthM + tolerance && plan.heightM <= area.heightM + tolerance
}

/** The offered scale with the most detail at which the plan fits; null if it fits at none. */
export function bestScale(
  plan: SizeM,
  paper: PaperSize,
  orientation: Orientation,
  options?: PageLayoutOptions,
): PrintScale | null {
  return PRINT_SCALES.find((scale) => fitsAtScale(plan, paper, orientation, scale, options)) ?? null
}

/**
 * The orientation that allows the most detailed scale; when both allow the same (or neither
 * fits), the one that matches the plan's shape (landscape for a wide plan).
 */
export function bestOrientation(
  plan: SizeM,
  paper: PaperSize,
  options?: PageLayoutOptions,
): Orientation {
  const byShape: Orientation = plan.widthM >= plan.heightM ? 'landscape' : 'portrait'
  const other: Orientation = byShape === 'landscape' ? 'portrait' : 'landscape'
  const rank = (scale: PrintScale | null) => (scale === null ? Infinity : scale)
  return rank(bestScale(plan, paper, other, options)) <
    rank(bestScale(plan, paper, byShape, options))
    ? other
    : byShape
}

/**
 * The part of the world (metres) the plan area shows at a scale, centred on the plan's bounds.
 * Map it onto the plan image to render the plan at exactly that scale.
 */
export function printedWorldBounds(planBounds: Bounds, planArea: RectMm, scale: number): Bounds {
  const centre = boundsCentre(planBounds)
  const halfWidthM = paperToGroundM(planArea.widthMm, scale) / 2
  const halfHeightM = paperToGroundM(planArea.heightMm, scale) / 2
  return {
    minX: centre.x - halfWidthM,
    minY: centre.y - halfHeightM,
    maxX: centre.x + halfWidthM,
    maxY: centre.y + halfHeightM,
  }
}

// --- Pixels -----------------------------------------------------------------------------------

export const mmToPx = (lengthMm: number, dpi = PRINT_DPI) => (lengthMm / MM_PER_INCH) * dpi

/** Pixel size of an area on paper rendered at a resolution (rounded to whole pixels). */
export function imageSizePx(size: SizeMm, dpi = PRINT_DPI): SizePx {
  return {
    widthPx: Math.round(mmToPx(size.widthMm, dpi)),
    heightPx: Math.round(mmToPx(size.heightMm, dpi)),
  }
}

/** Pixel size of the plan image for a page layout, at 300 dpi by default. */
export function planImageSizePx(layout: PageLayout, dpi = PRINT_DPI): SizePx {
  return imageSizePx(layout.plan, dpi)
}

/** Pixels per metre on the ground in the plan image (the viewport scale to render with). */
export function pxPerMetre(scale: number, dpi = PRINT_DPI): number {
  return mmToPx(groundToPaperMm(1, scale), dpi)
}

// --- Scale bar --------------------------------------------------------------------------------

/** The largest "nice" length (1, 2 or 5 × 10ⁿ m) that is at most `maxM`; 0 when maxM ≤ 0. */
export function niceLengthM(maxM: number): number {
  if (!(maxM > 0) || !Number.isFinite(maxM)) return 0
  const power = 10 ** Math.floor(Math.log10(maxM))
  for (const step of [10, 5, 2, 1]) {
    const length = Number((step * power).toPrecision(12))
    if (length <= maxM * (1 + 1e-9)) return length
  }
  return Number(power.toPrecision(12))
}

/** A scale bar at most `maxWidthMm` long on paper: its nice length and its printed width. */
export function scaleBar(maxWidthMm: number, scale: number): { lengthM: number; widthMm: number } {
  const lengthM = niceLengthM(paperToGroundM(maxWidthMm, scale))
  return { lengthM, widthMm: groundToPaperMm(lengthM, scale) }
}
