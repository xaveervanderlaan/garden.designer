import { SCHEMA_VERSION } from './schema'

type ProjectData = Record<string, unknown>

/** Upgrades a project from schema version n to n + 1 (the caller sets the new schemaVersion). */
export type Migration = (project: ProjectData) => ProjectData

/**
 * MIGRATIONS[n] upgrades a project from version n to n + 1. When the data model changes:
 * bump SCHEMA_VERSION in schema.ts and add the step here, with a test.
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {}

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
