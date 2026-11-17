import { describe, expect, it } from 'vitest'
import { baseRefs, defaultBrief, setBrief, setBriefArea } from './brief'
import { newProject } from './defaults'
import { migrateProject } from './migrations'
import { type GardenObject, type Project, projectSchema } from './schema'

const object = (id: string, kind: GardenObject['kind']): GardenObject => ({
  id,
  kind,
  shape: { type: 'point', position: { x: 0, y: 0 }, rotationDeg: 0 },
  status: 'new',
  layer: 'hardscape',
})

describe('brief', () => {
  it('migrates a v9 project without a brief', () => {
    const v9 = { ...newProject('Old', 1_700_000_000_000), schemaVersion: 9 }
    const migrated = projectSchema.parse(migrateProject(v9))
    expect(migrated.schemaVersion).toBe(10)
    expect(migrated.brief).toBeUndefined()
  })

  it('validates a stored brief', () => {
    const project = setBrief(newProject('A'), { ...defaultBrief(), styles: ['natural'] })
    expect(projectSchema.parse(project).brief?.styles).toEqual(['natural'])
    expect(() =>
      projectSchema.parse({ ...project, brief: { ...defaultBrief(), count: 21 } }),
    ).toThrow()
  })

  it('setBriefArea creates a default brief', () => {
    const area = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 3 },
    ]
    const withArea = setBriefArea(newProject('A'), area)
    expect(withArea.brief).toEqual({ ...defaultBrief(), area })
    expect(setBriefArea(withArea, null).brief).toEqual(defaultBrief())
  })

  it('baseRefs numbers objects and plantings, skipping dimensions', () => {
    const project: Project = {
      ...newProject('A'),
      objects: [object('a', 'shed'), object('d', 'dimension'), object('b', 'lawn')],
      plantings: [
        { id: 'p1', plantId: 'x', position: { x: 1, y: 1 }, plantedYear: 2026 },
        { id: 'p2', plantId: 'x', position: { x: 2, y: 1 }, plantedYear: 2026 },
      ],
    }
    const refs = baseRefs(project)
    expect([...refs.objects]).toEqual([
      ['E1', 'a'],
      ['E2', 'b'],
    ])
    expect([...refs.plantings]).toEqual([
      ['P1', 'p1'],
      ['P2', 'p2'],
    ])
    expect(refs.refOf.get('b')).toBe('E2')
    expect(refs.refOf.has('d')).toBe(false)
  })
})
