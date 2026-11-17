import { describe, expect, it } from 'vitest'
import { pointInPolygon, polygonArea } from '../geometry/polygon'
import { defaultBrief } from '../model/brief'
import { newProject } from '../model/defaults'
import type { Brief, Point, Project } from '../model/schema'
import { withoutIds } from '../test/withoutIds'
import { expandProposal, rectCorners } from './expand'
import { proposalSchema, type ProposalElement } from './format'

function base(brief: Partial<Brief> = {}): Project {
  const project = newProject('Base', 1_700_000_000_000)
  project.plot.outline = [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 15 },
    { x: 0, y: 15 },
  ]
  project.objects = [
    {
      id: 'shed',
      kind: 'shed',
      shape: {
        type: 'polygon',
        points: [
          { x: 16, y: 11 },
          { x: 19, y: 11 },
          { x: 19, y: 14 },
          { x: 16, y: 14 },
        ],
      },
      heightM: 2.4,
      layer: 'existing',
      status: 'existing',
    },
  ]
  project.plantings = [
    { id: 'birch', plantId: 'betula-pendula', position: { x: 3, y: 3 }, plantedYear: 2020 },
  ]
  project.brief = { ...defaultBrief(), ...brief }
  return project
}

function expand(elements: unknown[], project = base()) {
  const proposal = proposalSchema.parse({
    id: 'p1',
    title: 'T',
    concept: 'C',
    tags: [],
    highlights: [],
    elements,
  })
  return expandProposal(project, proposal, { year: 2027 })
}

const added = (project: Project) => project.plantings.filter((p) => p.id !== 'birch')
const newObjects = (project: Project) => project.objects.filter((o) => o.id !== 'shed')
const pointsOf = (project: Project, kind: string): Point[] => {
  const shape = project.objects.find((o) => o.kind === kind)!.shape
  return shape.type === 'point' ? [shape.position] : shape.points
}

describe('expandProposal', () => {
  it('adds objects as new with material, variant and height', () => {
    const { project, report } = expand([
      { type: 'object', kind: 'terrace', rect: { c: [8, 8], w: 4, d: 3 }, material: 'wood' },
      { type: 'object', kind: 'furniture', at: [8, 8], variant: 'bench', rot: 90 },
      {
        type: 'object',
        kind: 'shed',
        rect: { c: [12, 12], w: 3, d: 2 },
        heightM: 3,
        label: 'Tools',
      },
      {
        type: 'object',
        kind: 'fence',
        line: [
          [1, 14],
          [6, 14],
        ],
        thicknessM: 0.1,
      },
    ])
    const objects = newObjects(project)
    expect(objects.map((o) => o.kind)).toEqual(['terrace', 'furniture', 'shed', 'fence'])
    expect(objects.every((o) => o.status === 'new')).toBe(true)
    expect(objects[0]).toMatchObject({ material: 'wood', layer: 'hardscape' })
    expect(objects[1]).toMatchObject({ variant: 'bench', shape: { rotationDeg: 90 } })
    expect(objects[2]).toMatchObject({ heightM: 3, label: 'Tools' })
    expect(objects[3]!.shape).toMatchObject({ type: 'polyline', thicknessM: 0.1 })
    expect(report).toMatchObject({ objects: 4, plantings: 0, dropped: [] })
  })

  it('rotates rects clockwise', () => {
    // A 4 × 2 rect turned 90° clockwise (y down): its first corner (top left) ends up top right.
    const corners = rectCorners({ c: [10, 7], w: 4, d: 2, rot: 90 })
    expect(corners[0]!.x).toBeCloseTo(11)
    expect(corners[0]!.y).toBeCloseTo(5)
    const { project } = expand([
      { type: 'object', kind: 'terrace', rect: { c: [10, 7], w: 4, d: 2, rot: 90 } },
    ])
    const points = pointsOf(project, 'terrace')
    expect(Math.min(...points.map((p) => p.x))).toBeCloseTo(9)
    expect(Math.max(...points.map((p) => p.y))).toBeCloseTo(9)
    expect(polygonArea(points)).toBeCloseTo(8)
  })

  it('links hedges to their species', () => {
    const { project, report } = expand([
      {
        type: 'hedge',
        line: [
          [1, 1],
          [10, 1],
        ],
        plant: 'carpinus-betulus',
        heightM: 1.5,
      },
      {
        type: 'hedge',
        line: [
          [1, 2],
          [10, 2],
        ],
        plant: 'buddleja-davidii',
      },
    ])
    const hedges = newObjects(project)
    expect(hedges[0]).toMatchObject({ kind: 'hedge', plantId: 'carpinus-betulus', heightM: 1.5 })
    expect(hedges[1]!.plantId).toBeUndefined()
    expect(report.dropped).toEqual([
      { what: 'plant', reason: 'unknownPlant', name: 'buddleja-davidii' },
    ])
  })

  it('places specimens as given', () => {
    const { project, report } = expand([{ type: 'plant', plant: 'buddleja-davidii', at: [10, 7] }])
    expect(added(project)).toEqual([
      expect.objectContaining({ plantId: 'buddleja-davidii', position: { x: 10, y: 7 } }),
    ])
    expect(added(project)[0]!.plantedYear).toBe(2027)
    expect(report).toMatchObject({ plantings: 1, species: 1 })
  })

  it('spaces groups inside their bed', () => {
    const { project } = expand([
      { type: 'bed', kind: 'bed-ornamental', rect: { c: [10, 7], w: 4, d: 2 } },
      { type: 'group', plant: 'achillea-millefolium', at: [10, 7], count: 5 },
      { type: 'group', plant: 'alchemilla-mollis', at: [9, 7], count: 50 },
    ])
    const bed = newObjects(project)[0]!
    const plants = added(project)
    const achillea = plants.filter((p) => p.plantId === 'achillea-millefolium')
    expect(achillea).toHaveLength(5)
    const alchemilla = plants.filter((p) => p.plantId === 'alchemilla-mollis')
    expect(alchemilla.length).toBeGreaterThan(5)
    expect(alchemilla.length).toBeLessThan(50)
    for (const p of plants) {
      expect(p.bedId).toBe(bed.id)
      expect(pointInPolygon(p.position, pointsOf(project, 'bed-ornamental'))).toBe(true)
    }
    for (const a of plants) {
      for (const b of plants) {
        if (a !== b) {
          expect(
            Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y),
          ).toBeGreaterThan(0.4)
        }
      }
    }
  })

  it('fills a bed by shares', () => {
    const { project } = expand([
      {
        type: 'bed',
        kind: 'bed-ornamental',
        rect: { c: [10, 7], w: 6, d: 1.5 },
        mix: [
          { plant: 'achillea-millefolium', share: 3 },
          { plant: 'alchemilla-mollis', share: 1 },
        ],
      },
    ])
    const plants = added(project)
    const a = plants.filter((p) => p.plantId === 'achillea-millefolium')
    const b = plants.filter((p) => p.plantId === 'alchemilla-mollis')
    expect(plants.length).toBeGreaterThan(8)
    expect(Math.abs(a.length - 3 * b.length)).toBeLessThanOrEqual(3)
    // Contiguous runs along the bed's long side.
    expect(Math.max(...a.map((p) => p.position.x))).toBeLessThanOrEqual(
      Math.min(...b.map((p) => p.position.x)),
    )
  })

  it('lays crops out in rows', () => {
    const { project } = expand([
      {
        type: 'bed',
        kind: 'bed-vegetable',
        rect: { c: [10, 7], w: 4, d: 2.4 },
        crops: [{ plant: 'lactuca-sativa', rows: 2 }, { plant: 'solanum-lycopersicum' }],
      },
    ])
    const plants = added(project)
    const lettuce = plants.filter((p) => p.plantId === 'lactuca-sativa')
    const tomato = plants.filter((p) => p.plantId === 'solanum-lycopersicum')
    const rows = (list: typeof plants) => new Set(list.map((p) => p.position.y.toFixed(3)))
    expect(rows(lettuce).size).toBe(2)
    expect(tomato.length).toBeGreaterThan(0)
    expect(Math.min(...tomato.map((p) => p.position.y))).toBeGreaterThan(
      Math.max(...lettuce.map((p) => p.position.y)),
    )
  })

  it('removes only may-change items', () => {
    const { project, report } = expand(
      [
        { type: 'remove', ref: 'E1' },
        { type: 'remove', ref: 'P1' },
        { type: 'remove', ref: 'E9' },
      ],
      base({ mayChange: ['birch'] }),
    )
    expect(project.objects.map((o) => o.id)).toEqual(['shed'])
    expect(project.plantings).toEqual([])
    expect(report.dropped).toEqual([
      { what: 'remove', reason: 'fixed', name: 'E1' },
      { what: 'remove', reason: 'unknownRef', name: 'E9' },
    ])
  })

  it('clips to the design area', () => {
    const area = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 15 },
      { x: 0, y: 15 },
    ]
    const { project, report } = expand(
      [
        { type: 'object', kind: 'terrace', rect: { c: [10, 7], w: 4, d: 2 } },
        { type: 'object', kind: 'lawn', rect: { c: [10, 3], w: 0.2, d: 0.5 } },
        {
          type: 'object',
          kind: 'fence',
          line: [
            [5, 1],
            [10.3, 1],
          ],
        },
        {
          type: 'object',
          kind: 'wall',
          line: [
            [5, 2],
            [12, 2],
          ],
        },
        { type: 'object', kind: 'pond', rect: { c: [15, 7], w: 2, d: 2 } },
        { type: 'plant', plant: 'buddleja-davidii', at: [12, 7] },
      ],
      base({ area }),
    )
    expect(newObjects(project).map((o) => o.kind)).toEqual(['terrace', 'fence'])
    const terrace = pointsOf(project, 'terrace')
    expect(polygonArea(terrace)).toBeCloseTo(4)
    expect(Math.max(...terrace.map((p) => p.x))).toBeCloseTo(10)
    expect(pointsOf(project, 'fence')[1]).toEqual({ x: 10, y: 1 })
    expect(report.dropped).toEqual([
      { what: 'object', reason: 'tooSmall', name: 'lawn' },
      { what: 'object', reason: 'outside', name: 'wall' },
      { what: 'object', reason: 'outside', name: 'pond' },
      { what: 'plant', reason: 'outside', name: 'buddleja-davidii' },
    ])
  })

  it('drops overlapping plants', () => {
    const { project, report } = expand([
      { type: 'plant', plant: 'buddleja-davidii', at: [10, 7] },
      { type: 'plant', plant: 'buddleja-davidii', at: [11, 7] },
      { type: 'plant', plant: 'buddleja-davidii', at: [4, 4] }, // under the existing birch
      { type: 'plant', plant: 'buddleja-davidii', at: [13, 7] },
    ])
    expect(added(project).map((p) => p.position.x)).toEqual([10, 13])
    expect(report.dropped).toEqual([
      { what: 'plant', reason: 'overlap', name: 'buddleja-davidii' },
      { what: 'plant', reason: 'overlap', name: 'buddleja-davidii' },
    ])
  })

  it('reports unknown plants', () => {
    const { project, report } = expand([
      { type: 'plant', plant: 'Buddleja davidi', at: [10, 7] },
      { type: 'plant', plant: 'no-such-plant', at: [14, 7] },
    ])
    expect(added(project).map((p) => p.plantId)).toEqual(['buddleja-davidii'])
    expect(report.matched).toEqual([{ given: 'Buddleja davidi', id: 'buddleja-davidii' }])
    expect(report.dropped).toEqual([
      { what: 'plant', reason: 'unknownPlant', name: 'no-such-plant' },
    ])
  })

  it('is deterministic ignoring ids', () => {
    const elements: ProposalElement[] = [
      { type: 'remove', ref: 'P1' },
      {
        type: 'object',
        kind: 'path',
        polygon: [
          [1, 10],
          [9, 10],
          [9, 11],
          [1, 11],
        ],
        material: 'gravel',
      },
      {
        type: 'bed',
        kind: 'raised-bed',
        rect: { c: [14, 4], w: 2.4, d: 1.2 },
        crops: [{ plant: 'lactuca-sativa' }],
        rowAngleDeg: 90,
      },
      {
        type: 'bed',
        kind: 'bed-ornamental',
        polygon: [
          [2, 6],
          [8, 6],
          [8, 9],
          [2, 9],
        ],
        mix: [{ plant: 'alchemilla-mollis', share: 1 }],
      },
      {
        type: 'hedge',
        line: [
          [0.5, 14.5],
          [10, 14.5],
        ],
        plant: 'carpinus-betulus',
      },
      { type: 'group', plant: 'achillea-millefolium', at: [5, 7.5], count: 6 },
      { type: 'plant', plant: 'betula-pendula', at: [14, 10] },
    ]
    const one = expand(elements, base({ mayChange: ['birch'] }))
    const two = expand(elements, base({ mayChange: ['birch'] }))
    expect(one.project.objects.find((o) => o.kind === 'raised-bed')?.rowAngleDeg).toBe(90)
    expect(withoutIds(one)).toEqual(withoutIds(two))
    expect(one.project.plantings[0]!.id).not.toBe(two.project.plantings[0]!.id)
  })
})
