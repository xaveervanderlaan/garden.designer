import { describe, expect, it } from 'vitest'
import { sampleProjectWithAsset, samplePlant } from '../test/fixtures'
import { DEFAULT_SETTINGS, newProject, normaliseName } from './defaults'
import { LAYER_IDS, plantSchema, projectSchema, SCHEMA_VERSION } from './schema'

describe('newProject', () => {
  it('creates a valid project with the agreed defaults', () => {
    const project = newProject('My garden', 123)

    expect(projectSchema.parse(project)).toEqual(project)
    expect(project.schemaVersion).toBe(SCHEMA_VERSION)
    expect(project.settings).toEqual({
      location: { lat: 52.13, lng: 5.29 },
      northAngleDeg: 0,
      gridSizeM: 0.5,
      soil: 'sand',
    })
    expect(Object.keys(project.layers).sort()).toEqual([...LAYER_IDS].sort())
    expect(project.createdAt).toBe(123)
    expect(project.updatedAt).toBe(123)
  })

  it('gives every project its own id and its own copy of the defaults', () => {
    const a = newProject('A')
    const b = newProject('B')
    expect(a.id).not.toBe(b.id)
    a.settings.location.lat = 0
    expect(b.settings.location.lat).toBe(52.13)
    expect(DEFAULT_SETTINGS.location.lat).toBe(52.13)
  })

  it('cleans up the name and refuses an empty one', () => {
    expect(newProject('  Back   garden ').name).toBe('Back garden')
    expect(() => newProject('   ')).toThrow()
  })
})

describe('normaliseName', () => {
  it.each([
    ['  Front  garden ', 'Front garden'],
    ['\tTuin\n2 ', 'Tuin 2'],
    ['', ''],
    ['x'.repeat(150), 'x'.repeat(100)],
  ])('%j → %j', (input, expected) => {
    expect(normaliseName(input)).toBe(expected)
  })
})

describe('projectSchema', () => {
  const valid = () => sampleProjectWithAsset().project

  it('accepts a project with content in every part', () => {
    expect(projectSchema.safeParse(valid()).success).toBe(true)
  })

  it.each([
    ['unknown soil', (p: any) => (p.settings.soil = 'loam')],
    ['latitude out of range', (p: any) => (p.settings.location.lat = 100)],
    ['zero grid size', (p: any) => (p.settings.gridSizeM = 0)],
    ['north angle of 360°', (p: any) => (p.settings.northAngleDeg = 360)],
    ['other schema version', (p: any) => (p.schemaVersion = SCHEMA_VERSION + 1)],
    ['empty name', (p: any) => (p.name = '  ')],
    ['missing layer', (p: any) => delete p.layers.labels],
    ['polygon with 2 points', (p: any) => p.objects[0].shape.points.pop()],
    ['unknown object kind', (p: any) => (p.objects[0].kind = 'volcano')],
    ['opacity above 1', (p: any) => (p.background.opacity = 1.5)],
    ['infinite coordinate', (p: any) => (p.plot.outline[0].x = Infinity)],
  ])('rejects %s', (_, mutate) => {
    const project = valid()
    mutate(project)
    expect(projectSchema.safeParse(project).success).toBe(false)
  })
})

describe('plantSchema', () => {
  it('accepts a complete plant', () => {
    expect(plantSchema.parse(samplePlant)).toEqual(samplePlant)
  })

  it('rejects invalid months and empty sun/soil lists', () => {
    expect(plantSchema.safeParse({ ...samplePlant, bloomMonths: [13] }).success).toBe(false)
    expect(plantSchema.safeParse({ ...samplePlant, sun: [] }).success).toBe(false)
    expect(plantSchema.safeParse({ ...samplePlant, soil: [] }).success).toBe(false)
  })
})
