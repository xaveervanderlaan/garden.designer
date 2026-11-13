import { z } from 'zod'

/**
 * Data model (SPEC §8). The zod schemas are the single source of truth: the TypeScript types are
 * inferred from them, and every project that is loaded or imported is validated against them.
 * All lengths are in metres; timestamps are epoch milliseconds.
 *
 * Changing the shape of stored data? Bump SCHEMA_VERSION and add a migration (see migrations.ts).
 */
export const SCHEMA_VERSION = 2

export const idSchema = z.string().min(1).max(100)

export const pointSchema = z.object({ x: z.number(), y: z.number() })
export type Point = z.infer<typeof pointSchema>

// --- Vocabularies ---------------------------------------------------------------------------

export const SOIL_TYPES = ['clay', 'sand', 'peat'] as const
export type SoilType = (typeof SOIL_TYPES)[number]

export const LAYER_IDS = [
  'background',
  'existing',
  'hardscape',
  'plants',
  'vegetables',
  'shadows',
  'measurements',
  'labels',
] as const
export type LayerId = (typeof LAYER_IDS)[number]

export const OBJECT_KINDS = [
  // buildings & structures
  'house',
  'shed',
  'greenhouse',
  'pergola',
  'carport',
  'raised-bed',
  // paving & surfaces
  'terrace',
  'path',
  'driveway',
  'gravel',
  'lawn',
  // boundaries
  'fence',
  'wall',
  'hedge',
  'gate',
  // water & extras
  'pond',
  'furniture',
  'lighting',
  'play',
  'compost',
  'rain-barrel',
  // planting beds
  'bed-ornamental',
  'bed-vegetable',
] as const
export type ObjectKind = (typeof OBJECT_KINDS)[number]

export const PLANT_CATEGORIES = [
  'tree',
  'shrub',
  'hedge',
  'perennial',
  'grass',
  'fern',
  'climber',
  'bulb',
  'vegetable',
  'herb',
  'fruit',
] as const
export const SUN_LEVELS = ['full-sun', 'part-shade', 'shade'] as const
export const WILDLIFE = ['bees', 'butterflies', 'birds'] as const

const month = z.number().int().min(1).max(12)
const positiveLength = z.number().positive()

// --- Project parts --------------------------------------------------------------------------

export const settingsSchema = z.object({
  location: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
  northAngleDeg: z.number().min(0).lt(360),
  gridSizeM: positiveLength.max(100),
  soil: z.enum(SOIL_TYPES),
})
export type Settings = z.infer<typeof settingsSchema>

export const plotSchema = z.object({
  /** Plot boundary; empty until the plot has been drawn. */
  outline: z.array(pointSchema),
})

/**
 * The site plan (or aerial image) to trace over. The image bytes live in the assets table; a PDF
 * is stored as the rendered page. Showing and locking it is done with the "background" layer.
 * Pixels map to metres as described in geometry/calibration.ts.
 */
export const backgroundSchema = z.object({
  assetId: idSchema,
  widthPx: z.number().int().positive(),
  heightPx: z.number().int().positive(),
  /** Name of the imported file, and the page for a PDF: shown in the properties panel. */
  fileName: z.string().max(255).optional(),
  page: z.number().int().positive().optional(),
  metresPerPixel: z.number().positive(),
  /** World position of the image's top-left corner. */
  offset: pointSchema,
  /** Clockwise on screen (y points down), about the top-left corner, in [0, 360). */
  rotationDeg: z.number().min(0).lt(360),
  opacity: z.number().min(0).max(1),
  /** The last calibration: two points on the image (pixels) and their real distance. */
  calibration: z.object({ a: pointSchema, b: pointSchema, distanceM: positiveLength }).optional(),
})
export type Background = z.infer<typeof backgroundSchema>

export const shapeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('polygon'), points: z.array(pointSchema).min(3) }),
  z.object({
    type: z.literal('polyline'),
    points: z.array(pointSchema).min(2),
    thicknessM: positiveLength,
  }),
  z.object({ type: z.literal('point'), position: pointSchema, rotationDeg: z.number() }),
])
export type Shape = z.infer<typeof shapeSchema>

export const gardenObjectSchema = z.object({
  id: idSchema,
  kind: z.enum(OBJECT_KINDS),
  shape: shapeSchema,
  heightM: positiveLength.optional(),
  material: z.string().max(100).optional(),
  label: z.string().max(200).optional(),
  notes: z.string().max(5000).optional(),
  layer: z.enum(LAYER_IDS),
})
export type GardenObject = z.infer<typeof gardenObjectSchema>

export const plantingSchema = z.object({
  id: idSchema,
  /** Id of a built-in plant or of one of the project's custom plants. */
  plantId: idSchema,
  position: pointSchema,
  bedId: idSchema.optional(),
  plantedYear: z.number().int().min(1900).max(2200),
  notes: z.string().max(5000).optional(),
})
export type Planting = z.infer<typeof plantingSchema>

/** A plant species. Vocabularies such as colours are refined in M5 (plant library). */
export const plantSchema = z.object({
  id: idSchema,
  names: z.object({
    nl: z.string().min(1),
    en: z.string().min(1),
    latin: z.string().min(1),
  }),
  category: z.enum(PLANT_CATEGORIES),
  heightM: positiveLength,
  spreadM: positiveLength,
  yearsToMature: z.number().positive(),
  evergreen: z.boolean(),
  sun: z.array(z.enum(SUN_LEVELS)).min(1),
  soil: z.array(z.enum(SOIL_TYPES)).min(1),
  droughtTolerant: z.boolean(),
  bloomMonths: z.array(month),
  flowerColor: z.string().optional(),
  foliageColor: z.string().optional(),
  autumnColor: z.string().optional(),
  nativeNL: z.boolean(),
  wildlife: z.array(z.enum(WILDLIFE)),
  toxic: z.boolean(),
  verified: z.boolean(),
  veg: z
    .object({
      sowIndoors: z.array(month),
      sowOutdoors: z.array(month),
      plantOut: z.array(month),
      harvest: z.array(month),
      rowSpacingM: positiveLength,
      inRowSpacingM: positiveLength,
      family: z.string().min(1),
    })
    .optional(),
})
export type Plant = z.infer<typeof plantSchema>

const layerStateSchema = z.object({ visible: z.boolean(), locked: z.boolean() })
/** Every layer id must be present (zod records with enum keys are exhaustive). */
export const layersSchema = z.record(z.enum(LAYER_IDS), layerStateSchema)
export type Layers = z.infer<typeof layersSchema>

export const PROJECT_NAME_MAX_LENGTH = 100

export const projectSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1).max(PROJECT_NAME_MAX_LENGTH),
  schemaVersion: z.literal(SCHEMA_VERSION),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  settings: settingsSchema,
  plot: plotSchema,
  background: backgroundSchema.optional(),
  objects: z.array(gardenObjectSchema),
  plantings: z.array(plantingSchema),
  customPlants: z.array(plantSchema),
  layers: layersSchema,
})
export type Project = z.infer<typeof projectSchema>
