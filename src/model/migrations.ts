import { AUTUMN_COLORS, FLOWER_COLORS, FOLIAGE_COLORS, SCHEMA_VERSION } from './schema'

type ProjectData = Record<string, unknown>

/** Upgrades a project from schema version n to n + 1 (the caller sets the new schemaVersion). */
export type Migration = (project: ProjectData) => ProjectData

/**
 * MIGRATIONS[n] upgrades a project from version n to n + 1. When the data model changes:
 * bump SCHEMA_VERSION in schema.ts and add the step here, with a test.
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  /**
   * v2 (M4): the background got its pixel size and calibration, and is shown/locked through the
   * "background" layer instead of its own flags. Version 1 of the app had no way to add a
   * background, and its pixel size can't be recovered here, so a v1 background is dropped (its
   * image is cleaned up when the project is next opened).
   */
  1: (project) => {
    const { background: _, ...rest } = project
    return rest
  },
  /**
   * v3 (M5): plant colours come from a fixed palette, and a plant can have several flower
   * colours. Custom plants couldn't be created before M5, so this only tidies up hand-made data:
   * known colours are kept, anything else is dropped (foliage falls back to green).
   */
  2: (project) => ({
    ...project,
    customPlants: Array.isArray(project.customPlants)
      ? project.customPlants.map((plant) => migratePlantColors(plant))
      : project.customPlants,
  }),
  /**
   * v4 (M6): the overlap warning's threshold is a design setting (a fraction of the smaller
   * plant's diameter), starting at the default of 20 %.
   */
  3: (project) => ({
    ...project,
    settings: isRecord(project.settings)
      ? { overlapThreshold: 0.2, ...project.settings }
      : project.settings,
  }),
  /**
   * v5 (M8): every object is either part of the existing situation or new. Before M8 only beds
   * could be drawn, so objects become 'new', except anything already on the "existing" layer.
   * Plantings get no status (absent = new).
   */
  4: (project) => ({
    ...project,
    objects: Array.isArray(project.objects)
      ? project.objects.map((object) =>
          isRecord(object)
            ? { status: object.layer === 'existing' ? 'existing' : 'new', ...object }
            : object,
        )
      : project.objects,
  }),
  /**
   * v6 (M9): objects may have a `variant` (symbols) and a `plantId` (hedges). Both are optional,
   * so old data stays valid; the bump makes an older cached app refuse newer files instead of
   * silently dropping the fields.
   */
  5: (project) => project,
}

const isOneOf = <T extends string>(list: readonly T[], value: unknown): value is T =>
  list.includes(value as T)

function migratePlantColors(plant: unknown): unknown {
  if (!isRecord(plant)) return plant
  const { flowerColor, foliageColor, autumnColor, ...rest } = plant
  return {
    ...rest,
    flowerColors: isOneOf(FLOWER_COLORS, flowerColor) ? [flowerColor] : [],
    foliageColor: isOneOf(FOLIAGE_COLORS, foliageColor) ? foliageColor : 'green',
    ...(isOneOf(AUTUMN_COLORS, autumnColor) ? { autumnColor } : {}),
  }
}

export type MigrationErrorReason = 'missing-version' | 'newer-version' | 'missing-migration'

export class MigrationError extends Error {
  readonly reason: MigrationErrorReason

  constructor(reason: MigrationErrorReason, message: string) {
    super(message)
    this.name = 'MigrationError'
    this.reason = reason
  }
}

const isRecord = (value: unknown): value is ProjectData =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Brings raw project data (from IndexedDB or an imported file) up to `target`. The result still
 * has to be validated against projectSchema.
 */
export function migrateProject(
  raw: unknown,
  target: number = SCHEMA_VERSION,
  migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
): ProjectData {
  if (!isRecord(raw)) throw new MigrationError('missing-version', 'Project data is not an object')

  const version = raw.schemaVersion
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new MigrationError('missing-version', `Invalid schemaVersion: ${String(version)}`)
  }
  if (version > target) {
    throw new MigrationError(
      'newer-version',
      `Project has schema version ${version}; this app supports up to ${target}`,
    )
  }

  let project = raw
  for (let v = version; v < target; v++) {
    const step = migrations[v]
    if (!step) throw new MigrationError('missing-migration', `No migration from version ${v}`)
    project = { ...step(project), schemaVersion: v + 1 }
  }
  return project
}
