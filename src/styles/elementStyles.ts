import { materialOf, type MaterialId } from '../model/objectKinds'
import type { GardenObject, ObjectKind } from '../model/schema'

/**
 * How each kind of element looks on the plan (SPEC §5). One table for the canvas, legend and PDF
 * export: fill, outline and (optionally) a pattern per kind. Plant symbols per category are in
 * plantSymbols.ts. M9 adds the surface, boundary and symbol looks.
 */
export type ElementStyle = {
  fill: string
  stroke: string
  /** Outline width in screen pixels (default 1.25). */
  strokeWidthPx?: number
  pattern?: ElementPattern
}

/**
 * A pattern inside an outline, drawn in the object's own frame (so it turns with the object).
 * Spacings are in metres. Except for `rows`, a pattern that would be denser than
 * PATTERN_MIN_SPACING_PX on screen is drawn at 2×, 4×, … its spacing, so it stays readable when
 * zoomed out and at print scale; line widths are in screen pixels.
 * - `rows`: lines along the longest edge (a vegetable bed's rows); left out when too dense.
 * - `hatch`: parallel lines at `angleDeg` (clockwise from the frame's x axis), e.g. a house.
 * - `grid`: lines along both axes, from a corner (glass panes, tiles).
 * - `beams`: lines across the short side (a pergola's open beams).
 * - `cross`: the two diagonals of the frame box (an open roof, e.g. a carport).
 * - `dots`: staggered rows of dots (gravel, bark, grass); `radiusPx` on screen (default 1).
 * - `bond`: courses `widthM` apart along the frame's x axis, joints every `lengthM`, offset by half
 *   every other course (bricks, natural stone). Thinning scales the length by the same factor.
 * - `planks`: lines parallel to the frame box's long side (a wooden deck).
 */
export type ElementPattern =
  | { kind: 'rows'; spacingM: number; color: string }
  | { kind: 'hatch'; spacingM: number; angleDeg: number; color: string; widthPx?: number }
  | { kind: 'grid'; spacingM: number; color: string; widthPx?: number }
  | { kind: 'beams'; spacingM: number; color: string; widthPx?: number }
  | { kind: 'cross'; color: string; widthPx?: number }
  | { kind: 'dots'; spacingM: number; color: string; radiusPx?: number }
  | { kind: 'bond'; lengthM: number; widthM: number; color: string; widthPx?: number }
  | { kind: 'planks'; spacingM: number; color: string; widthPx?: number }

export const DEFAULT_STROKE_PX = 1.25
/** Pattern lines closer together than this on screen are thinned out (see ElementPattern). */
export const PATTERN_MIN_SPACING_PX = 6

/**
 * Objects that are already there (status 'existing') are drawn muted: fill and pattern see-through,
 * outline dashed (dash and gap in screen pixels).
 */
export const EXISTING_STYLE = { fillOpacity: 0.5, dashPx: [6, 4] as const }

export const SELECTION_COLOR = '#2f80d1'
export const WARNING_COLOR = '#b3261e'
/** The line measured to calibrate the site plan's scale. */
export const CALIBRATION_COLOR = '#c25400'
export const PLOT_STYLE = { stroke: '#253325', fill: 'rgba(255, 255, 255, 0.6)' }
export const PLANTING_STYLE: ElementStyle = { fill: 'rgba(110, 168, 90, 0.85)', stroke: '#3f6f33' }

/** How each surface material looks; a surface kind's own style is its default material's. */
export const MATERIAL_STYLES: Record<MaterialId, ElementStyle> = {
  tiles: {
    fill: '#d6d7d1',
    stroke: '#7d8178',
    pattern: { kind: 'grid', spacingM: 0.5, color: 'rgba(110, 114, 104, 0.55)' },
  },
  'natural-stone': {
    fill: '#ddd5c4',
    stroke: '#8a7f6b',
    pattern: { kind: 'bond', lengthM: 0.6, widthM: 0.4, color: 'rgba(125, 113, 92, 0.6)' },
  },
  wood: {
    fill: '#c9a77a',
    stroke: '#7d5f3d',
    pattern: { kind: 'planks', spacingM: 0.15, color: 'rgba(110, 80, 45, 0.55)' },
  },
  concrete: { fill: '#cfd0ca', stroke: '#7d8178' },
  bricks: {
    fill: '#c9937a',
    stroke: '#8a5235',
    pattern: { kind: 'bond', lengthM: 0.21, widthM: 0.105, color: 'rgba(120, 66, 40, 0.55)' },
  },
  gravel: {
    fill: '#ebe3cf',
    stroke: '#b3a383',
    pattern: { kind: 'dots', spacingM: 0.15, color: 'rgba(140, 125, 95, 0.7)' },
  },
  bark: {
    fill: '#b08a64',
    stroke: '#6e5235',
    pattern: { kind: 'dots', spacingM: 0.2, color: 'rgba(85, 58, 32, 0.7)', radiusPx: 1.25 },
  },
  grass: {
    fill: '#cfe5b4',
    stroke: '#8db36a',
    pattern: { kind: 'dots', spacingM: 0.3, color: 'rgba(100, 150, 70, 0.6)' },
  },
  meadow: {
    fill: '#dbe9b2',
    stroke: '#8db36a',
    pattern: { kind: 'dots', spacingM: 0.35, color: 'rgba(196, 120, 160, 0.75)', radiusPx: 1.5 },
  },
}

/** A kept measurement: a thin line with end ticks and a length per segment. */
export const DIMENSION_STYLE = { color: '#3b4a5a', widthPx: 1.5, tickPx: 8, fontPx: 11 }
export const AREA_LABEL_STYLE = { color: '#253325', fontPx: 11 }

export const OBJECT_STYLES: Record<ObjectKind, ElementStyle> = {
  // Buildings: dark grey with a diagonal hatch. Shed, greenhouse and pergola lighter: the
  // greenhouse with a glass grid, the pergola with open beams over what grows under it; a carport
  // is an open roof (crossed). A raised bed: darker soil brown with rows and a timber edge.
  house: {
    fill: '#76796f',
    stroke: '#2e302b',
    strokeWidthPx: 2,
    pattern: { kind: 'hatch', spacingM: 0.6, angleDeg: 45, color: 'rgba(35, 37, 32, 0.55)' },
  },
  shed: {
    fill: '#b9bcb4',
    stroke: '#585c54',
    strokeWidthPx: 1.75,
    pattern: { kind: 'hatch', spacingM: 0.4, angleDeg: 45, color: 'rgba(70, 74, 66, 0.4)' },
  },
  greenhouse: {
    fill: '#e4efea',
    stroke: '#5f8070',
    strokeWidthPx: 1.75,
    pattern: { kind: 'grid', spacingM: 0.6, color: 'rgba(95, 128, 112, 0.75)' },
  },
  pergola: {
    fill: 'rgba(196, 170, 134, 0.18)',
    stroke: '#7d5f3d',
    strokeWidthPx: 3,
    pattern: { kind: 'beams', spacingM: 0.5, color: '#8d6d48', widthPx: 2 },
  },
  carport: {
    fill: 'rgba(196, 198, 192, 0.6)',
    stroke: '#5f635b',
    strokeWidthPx: 1.75,
    pattern: { kind: 'cross', color: 'rgba(95, 99, 91, 0.7)' },
  },
  'raised-bed': {
    fill: '#a8794d',
    stroke: '#5a3b1e',
    strokeWidthPx: 3,
    pattern: { kind: 'rows', spacingM: 0.4, color: 'rgba(70, 44, 20, 0.45)' },
  },
  terrace: MATERIAL_STYLES.tiles,
  path: MATERIAL_STYLES.tiles,
  driveway: MATERIAL_STYLES.bricks,
  gravel: MATERIAL_STYLES.gravel,
  lawn: MATERIAL_STYLES.grass,
  fence: { fill: '#8a6a45', stroke: '#6e5235' },
  wall: { fill: '#7a7c76', stroke: '#585a55' },
  hedge: { fill: '#5e8f4e', stroke: '#3f6f33' },
  gate: { fill: '#a07c52', stroke: '#6e5235' },
  // Plain blue with faint water lines.
  pond: {
    fill: '#b7daf0',
    stroke: '#4f8fbf',
    strokeWidthPx: 1.75,
    pattern: { kind: 'hatch', spacingM: 0.6, angleDeg: 0, color: 'rgba(79, 143, 191, 0.3)' },
  },
  furniture: { fill: '#e9d5b5', stroke: '#8a6a45' },
  lighting: { fill: '#ffe9a3', stroke: '#b38f1d' },
  play: { fill: '#f3c7a5', stroke: '#b36b3a' },
  compost: { fill: '#9c7a57', stroke: '#5c4129' },
  'rain-barrel': { fill: '#9fc3dc', stroke: '#4f7f9f' },
  // Ornamental bed: soil brown with a light outline. Vegetable bed: darker, with row lines.
  'bed-ornamental': { fill: '#dcc3a1', stroke: '#a8875f', strokeWidthPx: 1.5 },
  'bed-vegetable': {
    fill: '#c29667',
    stroke: '#7a5532',
    strokeWidthPx: 1.5,
    pattern: { kind: 'rows', spacingM: 0.5, color: 'rgba(92, 61, 30, 0.45)' },
  },
  dimension: { fill: 'transparent', stroke: '#3b4a5a', strokeWidthPx: 1.5 },
}

/** How an object looks: a surface by its material, anything else by its kind. */
export function objectStyle(object: Pick<GardenObject, 'kind' | 'material'>): ElementStyle {
  const material = materialOf(object)
  return material ? MATERIAL_STYLES[material] : OBJECT_STYLES[object.kind]
}

export type BoundaryKind = 'fence' | 'wall' | 'hedge' | 'gate'

/**
 * Boundaries are drawn as bands of their real thickness, but never thinner than `minWidthPx` on
 * screen. A fence has posts at its ends and corners and at most `postSpacingM` apart; a gate is a
 * dashed line between two posts; a wall and a hedge get darker edges.
 */
export const BOUNDARY_LOOKS: Record<
  BoundaryKind,
  {
    minWidthPx: number
    edge?: string
    postSpacingM?: number
    postSizeM?: number
    dashPx?: readonly [number, number]
  }
> = {
  fence: { minWidthPx: 2, postSpacingM: 2.4, postSizeM: 0.1 },
  wall: { minWidthPx: 3, edge: '#3e403b' },
  hedge: { minWidthPx: 4, edge: '#3f6f33' },
  gate: { minWidthPx: 2, postSizeM: 0.12, dashPx: [6, 4] },
}

/** Plants on the plan: selection ring, warning badge and labels (sizes in screen pixels). */
export const PLANTING_MARKS = {
  selectionColor: SELECTION_COLOR,
  selectionWidthPx: 2.5,
  warningColor: WARNING_COLOR,
  /** A badge for a notice (e.g. needs watering on sand) rather than a real problem. */
  noticeColor: '#c47a00',
  warningSizePx: 13,
  labelColor: '#253325',
  labelHalo: '#ffffff',
  labelFontPx: 11,
  /** Placement previews (filling a bed, a row, stamping) are drawn see-through. */
  previewOpacity: 0.55,
}

/** Grid line colours on the canvas. */
export const GRID_COLORS = { minor: '#e6ebe1', major: '#cdd6c6', background: '#f7f9f4' }

/** The shadow layer (M11): semi-transparent over the items. */
export const SHADOW_STYLE = { color: '#1f2a44', opacity: 0.3 }
