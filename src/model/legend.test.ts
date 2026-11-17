import { describe, expect, it } from 'vitest'
import { newProject } from './defaults'
import { setLayerState } from './edit'
import { legendEntries } from './legend'
import { addObject } from './objects'
import { addPlantings } from './plantings'
import type { ObjectKind, Project } from './schema'
import { samplePlant } from '../test/fixtures'

const square = (x: number) => [
  { x, y: 0 },
  { x: x + 1, y: 0 },
  { x: x + 1, y: 1 },
  { x, y: 1 },
]

function build(kinds: ObjectKind[]): Project {
  let project: Project = { ...newProject('Legend', 0), customPlants: [samplePlant] }
  kinds.forEach((kind, i) => {
    project = addObject(project, kind, { type: 'polygon', points: square(i * 2) }).project
  })
  return project
}

describe('legendEntries', () => {
  it('lists styles in use once, in draw order', () => {
    let project = build(['shed', 'terrace', 'terrace', 'bed-ornamental'])
    project = addPlantings(
      project,
      samplePlant.id,
      [
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ],
      2026,
    ).project
    const entries = legendEntries(project)
    expect(entries.map((e) => (e.type === 'object' ? e.kind : e.type))).toEqual([
      'terrace',
      'bed-ornamental',
      'shed',
      'plant',
    ])
    const terrace = entries[0]!
    expect(terrace).toEqual({ type: 'object', kind: 'terrace', material: 'tiles' })
  })

  it('adds the plot and existing entries', () => {
    let project = build(['house'])
    project = { ...project, plot: { outline: square(0) } }
    const types = legendEntries(project).map((e) => e.type)
    expect(types[0]).toBe('plot')
    expect(types.at(-1)).toBe('existing')
  })

  it('skips hidden layers', () => {
    const project = setLayerState(build(['terrace', 'bed-ornamental']), 'hardscape', {
      visible: false,
    })
    expect(legendEntries(project).map((e) => (e.type === 'object' ? e.kind : e.type))).toEqual([
      'bed-ornamental',
    ])
  })
})
