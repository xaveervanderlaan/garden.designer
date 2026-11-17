import { describe, expect, it } from 'vitest'
import { areaTotals, planLabels } from './areas'
import { newProject } from './defaults'
import { setLayerState } from './edit'
import { addObject } from './objects'
import type { ObjectKind, Point, Project } from './schema'

const rect = (x: number, y: number, w: number, h: number): Point[] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
]

function build(items: [ObjectKind, Point[], Record<string, unknown>?][], plot = true) {
  let project: Project = newProject('Areas', 0)
  if (plot) project = { ...project, plot: { outline: rect(0, 0, 10, 10) } }
  for (const [kind, points, extra] of items) {
    const { project: next, id } = addObject(project, kind, { type: 'polygon', points })
    project = {
      ...next,
      objects: next.objects.map((o) => (o.id === id ? { ...o, ...extra } : o)),
    }
  }
  return project
}

describe('areaTotals', () => {
  it('nets surfaces and clips to the plot', () => {
    const project = build([
      ['lawn', rect(0, 0, 10, 10)],
      ['bed-ornamental', rect(2, 2, 2, 2)], // 4 m² on top of the lawn
      ['terrace', rect(8, 0, 4, 2)], // half outside the plot: 4 m² inside
    ])
    const totals = areaTotals(project)
    expect(totals.plotM2).toBe(100)
    const green = totals.groups.find((g) => g.group === 'green')!
    expect(green.totalM2).toBeCloseTo(92) // minus the bed and the terrace on top
    expect(totals.groups.find((g) => g.group === 'paved')!.totalM2).toBeCloseTo(4)
    expect(totals.groups.find((g) => g.group === 'beds')!.totalM2).toBeCloseTo(4)
    expect(totals.groups.find((g) => g.group === 'water')).toBeUndefined()
  })

  it('groups paving by kind and material', () => {
    const project = build([
      ['terrace', rect(0, 0, 2, 2), { material: 'tiles' }],
      ['terrace', rect(3, 0, 2, 2), { material: 'tiles' }],
      ['terrace', rect(6, 0, 2, 2), { material: 'wood' }],
      ['path', rect(0, 5, 1, 5)],
    ])
    const paved = areaTotals(project).groups.find((g) => g.group === 'paved')!
    expect(paved.rows.map((r) => [r.kind, r.material, r.count, r.areaM2])).toEqual([
      ['terrace', 'tiles', 2, 8],
      ['terrace', 'wood', 1, 4],
      ['path', 'tiles', 1, 5],
    ])
    expect(paved.totalM2).toBe(17)
  })

  it('has no plot total without a plot', () => {
    expect(areaTotals(build([['lawn', rect(0, 0, 4, 4)]], false)).plotM2).toBeNull()
  })
})

describe('planLabels', () => {
  it('plan labels follow layer visibility', () => {
    const project = build([
      ['lawn', rect(0, 0, 4, 4), { label: 'Front lawn' }],
      ['shed', rect(6, 6, 2, 2), { label: 'Shed' }],
    ])
    const both = planLabels(project, { names: true, areas: true }, 'en')
    expect(both).toHaveLength(2)
    const lawn = both.find((l) => l.lines[0] === 'Front lawn')!
    expect(lawn.lines).toHaveLength(2)
    expect(lawn.lines[1]).toMatch(/^16\.00\sm²$/)
    expect(lawn.at).toEqual({ x: 2, y: 2 })
    // structures get no area line
    expect(both.find((l) => l.lines[0] === 'Shed')!.lines).toEqual(['Shed'])
    // names off: only the area of the lawn remains
    const areasOnly = planLabels(project, { names: false, areas: true }, 'en')
    expect(areasOnly.map((l) => l.lines.length)).toEqual([1])
    // hiding the hardscape layer hides both objects' labels
    const hidden = setLayerState(project, 'hardscape', { visible: false })
    expect(planLabels(hidden, { names: true, areas: true }, 'en')).toEqual([])
  })
})
