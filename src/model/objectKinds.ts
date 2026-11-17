import type { GardenObject, LayerId, ObjectKind, ObjectStatus } from './schema'

/**
 * What every kind of garden object is: its shape, where it sits in the drawing order, its layer,
 * how it is edited, and what a newly drawn one starts with (its preset). The look per kind is in
 * styles/elementStyles.ts. Adding a kind to the palette (M9) is a matter of adding its preset,
 * its style and its names.
 */

export type ObjectShapeType = 'polygon' | 'polyline' | 'point'

/**
 * The drawing order, bottom to top: surfaces < beds < plants < structures < tree canopies (drawn
 * see-through, so what's under a tree stays visible). Within a band, things are drawn in the order
 * of `project.objects` (or `project.plantings`): later is on top. Bring forward / send back
 * reorders within a band (model/drawOrder.ts), so the order is saved with the design.
 */
export const DRAW_BANDS = ['surface', 'bed', 'plant', 'structure', 'canopy'] as const
export type DrawBand = (typeof DRAW_BANDS)[number]

export type ObjectPreset = {
  shape: ObjectShapeType
  band: Exclude<DrawBand, 'plant' | 'canopy'>
  /** The layer of a new object of this kind (an existing one is on the "existing" layer). */
  layer: LayerId
  /** The status a newly drawn object gets. */
  status: ObjectStatus
  /**
   * 'corners': selected, it shows its corner handles (beds, like the plot). 'transform': handles
   * to move, rotate and resize it, and its corners on request.
   */
  editing: 'corners' | 'transform'
  /** Polygons: the default footprint, width (x) × depth (y). */
  sizeM?: { width: number; depth: number }
  /** The default height. Kinds without one have no height (and cast no shadow). */
  heightM?: number
  /** Polylines: the default thickness. */
  thicknessM?: number
}

const structure = (
  sizeM: { width: number; depth: number },
  heightM: number,
  status: ObjectStatus = 'new',
): ObjectPreset => ({
  shape: 'polygon',
  band: 'structure',
  layer: 'hardscape',
  status,
  editing: 'transform',
  sizeM,
  heightM,
})

const surface = (sizeM: { width: number; depth: number }): ObjectPreset => ({
  shape: 'polygon',
  band: 'surface',
  layer: 'hardscape',
  status: 'new',
  editing: 'transform',
  sizeM,
})

const boundary = (thicknessM: number, heightM: number): ObjectPreset => ({
  shape: 'polyline',
  band: 'structure',
  layer: 'hardscape',
  status: 'new',
  editing: 'transform',
  thicknessM,
  heightM,
})

const symbol = (heightM?: number): ObjectPreset => ({
  shape: 'point',
  band: 'structure',
  layer: 'hardscape',
  status: 'new',
  editing: 'transform',
  ...(heightM === undefined ? {} : { heightM }),
})

/**
 * Presets per kind. Heights are typical Dutch sizes: a house is usually there already, so it starts
 * as existing. Surfaces, boundaries and symbols (M9) have provisional defaults.
 */
export const OBJECT_PRESETS: Record<ObjectKind, ObjectPreset> = {
  house: structure({ width: 10, depth: 8 }, 8, 'existing'),
  shed: structure({ width: 3, depth: 2.5 }, 2.4),
  greenhouse: structure({ width: 3, depth: 2.5 }, 2.3),
  pergola: structure({ width: 3, depth: 3 }, 2.4),
  carport: structure({ width: 3, depth: 5 }, 2.4),
  // A raised bed holds plants like a bed, but is a structure with a height: it is drawn below
  // the plants and moved, rotated and resized like a structure.
  'raised-bed': {
    shape: 'polygon',
    band: 'bed',
    layer: 'hardscape',
    status: 'new',
    editing: 'transform',
    sizeM: { width: 2.4, depth: 1.2 },
    heightM: 0.4,
  },
  terrace: surface({ width: 4, depth: 3 }),
  path: surface({ width: 1, depth: 5 }),
  driveway: surface({ width: 3, depth: 6 }),
  gravel: surface({ width: 3, depth: 2 }),
  lawn: surface({ width: 6, depth: 5 }),
  pond: surface({ width: 2.5, depth: 1.5 }),
  fence: boundary(0.05, 1.8),
  wall: boundary(0.2, 1.8),
  hedge: boundary(0.6, 1.5),
  gate: boundary(0.05, 1.8),
  furniture: symbol(),
  lighting: symbol(),
  play: symbol(2),
  compost: symbol(1),
  'rain-barrel': symbol(1),
  'bed-ornamental': {
    shape: 'polygon',
    band: 'bed',
    layer: 'plants',
    status: 'new',
    editing: 'corners',
    sizeM: { width: 3, depth: 1.5 },
  },
  'bed-vegetable': {
    shape: 'polygon',
    band: 'bed',
    layer: 'vegetables',
    status: 'new',
    editing: 'corners',
    sizeM: { width: 3, depth: 1.2 },
  },
}

/** The palette groups for adding objects (M9: surfaces, boundaries, water & extras). */
export const OBJECT_PALETTE = [
  {
    group: 'structures',
    kinds: ['house', 'shed', 'greenhouse', 'pergola', 'carport', 'raised-bed'],
  },
  { group: 'surfaces', kinds: ['terrace', 'path', 'driveway', 'gravel', 'lawn'] },
  { group: 'boundaries', kinds: ['fence', 'wall', 'hedge', 'gate'] },
  {
    group: 'extras',
    kinds: ['pond', 'furniture', 'lighting', 'play', 'compost', 'rain-barrel'],
  },
] as const satisfies ReadonlyArray<{ group: string; kinds: readonly ObjectKind[] }>
export type PaletteGroup = (typeof OBJECT_PALETTE)[number]['group']

/** The kinds in the same palette group (and of the same shape) as `kind`: what it can switch to. */
export function kindsLike(kind: ObjectKind): readonly ObjectKind[] {
  const group = OBJECT_PALETTE.find((g) => (g.kinds as readonly ObjectKind[]).includes(kind))
  if (!group) return [kind]
  const shape = OBJECT_PRESETS[kind].shape
  return (group.kinds as readonly ObjectKind[]).filter((k) => OBJECT_PRESETS[k].shape === shape)
}

// --- Materials ------------------------------------------------------------------------------

export const MATERIAL_IDS = [
  'tiles',
  'natural-stone',
  'wood',
  'concrete',
  'bricks',
  'gravel',
  'bark',
  'grass',
  'meadow',
] as const
export type MaterialId = (typeof MATERIAL_IDS)[number]

/** The materials of a surface kind; the first one is the default. */
export const MATERIALS_BY_KIND: Partial<Record<ObjectKind, readonly MaterialId[]>> = {
  terrace: ['tiles', 'natural-stone', 'wood', 'concrete'],
  path: ['tiles', 'gravel', 'bark', 'natural-stone'],
  driveway: ['bricks', 'concrete', 'gravel'],
  gravel: ['gravel', 'bark'],
  lawn: ['grass', 'meadow'],
}

export function materialsFor(kind: ObjectKind): readonly MaterialId[] {
  return MATERIALS_BY_KIND[kind] ?? []
}

/** The material of an object: its own if valid for its kind, else the kind's first (or null). */
export function materialOf(object: Pick<GardenObject, 'kind' | 'material'>): MaterialId | null {
  const list = materialsFor(object.kind)
  const own = list.find((m) => m === object.material)
  return own ?? list[0] ?? null
}

// --- Symbols --------------------------------------------------------------------------------

export const SYMBOL_VARIANT_IDS = [
  'dining-set',
  'bench',
  'lounger',
  'parasol',
  'lamp',
  'swing',
  'sandbox',
  'trampoline',
  'playhouse',
  'compost-bin',
  'rain-barrel',
] as const
export type SymbolVariantId = (typeof SYMBOL_VARIANT_IDS)[number]

/** A symbol's real size: width (x) × depth (y), or a circle of diameter `widthM`. */
export type SymbolVariant = {
  id: SymbolVariantId
  widthM: number
  depthM: number
  round: boolean
}

const box = (id: SymbolVariantId, widthM: number, depthM: number): SymbolVariant => ({
  id,
  widthM,
  depthM,
  round: false,
})
const disc = (id: SymbolVariantId, diameterM: number): SymbolVariant => ({
  id,
  widthM: diameterM,
  depthM: diameterM,
  round: true,
})

/** The variants per point kind; the first is the default. */
export const SYMBOL_VARIANTS: Partial<Record<ObjectKind, readonly SymbolVariant[]>> = {
  furniture: [
    box('dining-set', 2, 1.8),
    box('bench', 1.5, 0.6),
    box('lounger', 2, 0.7),
    disc('parasol', 3),
  ],
  lighting: [disc('lamp', 0.3)],
  play: [
    box('swing', 3.5, 2),
    box('sandbox', 1.5, 1.5),
    disc('trampoline', 3),
    box('playhouse', 1.5, 1.5),
  ],
  compost: [box('compost-bin', 1, 1)],
  'rain-barrel': [disc('rain-barrel', 0.6)],
}

/** The symbol of a point kind with the given variant (unknown or none: the first). */
export function symbolFor(kind: ObjectKind, variant?: string): SymbolVariant | null {
  const list = SYMBOL_VARIANTS[kind]
  if (!list) return null
  return list.find((v) => v.id === variant) ?? list[0] ?? null
}

/** Radius of the circle around a symbol: half the width if round, else half the diagonal. */
export function symbolRadiusM(kind: ObjectKind, variant?: string): number {
  const symbol = symbolFor(kind, variant)
  if (!symbol) return 0.3
  return symbol.round ? symbol.widthM / 2 : Math.hypot(symbol.widthM, symbol.depthM) / 2
}

/** Existing things are on the "existing situation" layer; new ones on their kind's layer. */
export function objectLayer(kind: ObjectKind, status: ObjectStatus): LayerId {
  return status === 'existing' ? 'existing' : OBJECT_PRESETS[kind].layer
}

export function hasHeight(kind: ObjectKind): boolean {
  return OBJECT_PRESETS[kind].heightM !== undefined
}

/** Beds are edited by their corners; everything else gets the move/rotate/resize handles. */
export function editedByCorners(kind: ObjectKind): boolean {
  return OBJECT_PRESETS[kind].editing === 'corners'
}
