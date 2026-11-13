import { describe, expect, it } from 'vitest'
import { MIGRATIONS, type Migration, MigrationError, migrateProject } from './migrations'
import { SCHEMA_VERSION } from './schema'

const reasonOf = (fn: () => unknown) => {
  try {
    fn()
  } catch (error) {
    return error instanceof MigrationError ? error.reason : 'other'
  }
  return 'no error'
}

describe('migrateProject', () => {
  it('leaves a current project unchanged', () => {
    const project = { schemaVersion: SCHEMA_VERSION, name: 'x' }
    expect(migrateProject(project)).toEqual(project)
  })

  it('applies every step in order and stamps each new version', () => {
    // Test migrations: v1 → v2 renames a field, v2 → v3 adds one.
    const migrations: Record<number, Migration> = {
      1: ({ gridSize, ...rest }) => ({ ...rest, gridSizeM: gridSize }),
      2: (p) => ({ ...p, soil: 'sand', seenVersion: p.schemaVersion }),
    }
    const result = migrateProject({ schemaVersion: 1, gridSize: 0.5 }, 3, migrations)
    expect(result).toEqual({ schemaVersion: 3, gridSizeM: 0.5, soil: 'sand', seenVersion: 2 })
  })

  it('refuses projects from a newer app version', () => {
    expect(reasonOf(() => migrateProject({ schemaVersion: SCHEMA_VERSION + 1 }))).toBe(
      'newer-version',
    )
  })

  it.each([
    null,
    [],
    'x',
    {},
    { schemaVersion: 0 },
    { schemaVersion: 1.5 },
    { schemaVersion: '1' },
  ])('refuses %j without a valid version', (raw) => {
    expect(reasonOf(() => migrateProject(raw))).toBe('missing-version')
  })

  it('reports a gap in the migration chain', () => {
    expect(reasonOf(() => migrateProject({ schemaVersion: 1 }, 3, { 1: (p) => p }))).toBe(
      'missing-migration',
    )
  })

  it('has a migration for every version below the current one', () => {
    for (let v = 1; v < SCHEMA_VERSION; v++) expect(MIGRATIONS[v], `v${v}`).toBeDefined()
  })
})
