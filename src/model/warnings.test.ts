import { describe, expect, it } from 'vitest'
import { samplePlant } from '../test/fixtures'
import { addBed } from './beds'
import { newProject } from './defaults'
import { addPlantings } from './plantings'
import type { GardenObject, ObjectKind, Plant, Planting, Project, Shape } from './schema'
import {
  designWarnings,
  findOverlaps,
  groupWarnings,
  overlapFraction,
  structureOverlapFraction,
  warningSeverity,
  plantingWarnings,
  warningsByPlanting,
} from './warnings'

/** A 1 m wide plant (radius 0.5) that suits sand. */
const shrub: Plant = { ...samplePlant, id: 'custom-shrub', spreadM: 1, soil: ['sand'] }
/** A 2 m wide plant (radius 1). */
const big: Plant = { ...samplePlant, id: 'custom-big', spreadM: 2, soil: ['sand'] }
/** Grows on clay only. */
const clayPlant: Plant = { ...samplePlant, id: 'custom-clay', soil: ['clay'] }
/** Grows on sand, but isn't drought tolerant. */
const thirsty: Plant = { ...samplePlant, id: 'custom-thirsty', droughtTolerant: false }
const hedge: Plant = { ...samplePlant, id: 'custom-hedge', category: 'hedge', spreadM: 1 }

const at = (id: string, plantId: string, x: number, y = 5): Planting => ({
  id,
  plantId,
  position: { x, y },
  plantedYear: 2027,
})

function design(plantings: Planting[]): Project {
  const project = newProject('Warnings', 0)
  return {
    ...project,
    plot: {
      outline: [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 10 },
        { x: 0, y: 10 },
      ],
    },
    customPlants: [shrub, big, clayPlant, thirsty, hedge],
    plantings,
  }
}

describe('overlapFraction', () => {
  it('measures the overlap against the smaller diameter', () => {
    expect(overlapFraction({ x: 0, y: 0, r: 0.5 }, { x: 2, y: 0, r: 0.5 })).toBe(0)
    expect(overlapFraction({ x: 0, y: 0, r: 0.5 }, { x: 1, y: 0, r: 0.5 })).toBe(0)
    expect(overlapFraction({ x: 0, y: 0, r: 0.5 }, { x: 0.8, y: 0, r: 0.5 })).toBeCloseTo(0.2)
    // A small plant 0.25 m into a big one: 0.25 / 0.5.
    expect(overlapFraction({ x: 0, y: 0, r: 1 }, { x: 1, y: 0, r: 0.25 })).toBeCloseTo(0.5)
    // Completely inside: capped at 1.
    expect(overlapFraction({ x: 0, y: 0, r: 2 }, { x: 0, y: 0, r: 0.25 })).toBe(1)
  })
})

describe('findOverlaps', () => {
  it('finds every pair above the threshold, like comparing all pairs', () => {
    // A grid with random wiggle: compare the sweep with brute force.
    let seed = 7
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    const circles = Array.from({ length: 300 }, (_, i) => ({
      id: String(i),
      x: random() * 30,
      y: random() * 30,
      r: 0.2 + random() * 1.5,
    }))
    const found = findOverlaps(circles, 0.2)
    let brute = 0
    for (let i = 0; i < circles.length; i++) {
      for (let j = i + 1; j < circles.length; j++) {
        if (overlapFraction(circles[i]!, circles[j]!) > 0.2) brute++
      }
    }
    expect(found.length).toBe(brute)
    expect(brute).toBeGreaterThan(0)
  })
})

describe('plantingWarnings', () => {
  it('crops in the same vegetable bed may overlap; the same crops in an ornamental bed warn', () => {
    const outline = [
      { x: 1, y: 1 },
      { x: 5, y: 1 },
      { x: 5, y: 3 },
      { x: 1, y: 3 },
    ]
    const overlapsIn = (kind: 'bed-vegetable' | 'bed-ornamental') => {
      const bed = addBed(design([]), kind, outline)
      const { project } = addPlantings(
        bed.project,
        'lactuca-sativa',
        [
          { x: 2, y: 2 },
          { x: 2.05, y: 2 },
        ],
        2027,
      )
      return plantingWarnings(project).filter((w) => w.kind === 'overlap')
    }
    expect(overlapsIn('bed-vegetable')).toHaveLength(0)
    expect(overlapsIn('bed-ornamental')).toHaveLength(1)
  })

  it('warns about overlaps beyond the threshold only', () => {
    // Shrubs 1 m wide: 0.85 m apart = 15 % overlap, 0.7 m apart = 30 %.
    const warnings = plantingWarnings(
      design([
        at('a', shrub.id, 2),
        at('b', shrub.id, 2.85),
        at('c', shrub.id, 8),
        at('d', shrub.id, 8.7),
      ]),
    )
    expect(warnings).toEqual([
      { kind: 'overlap', plantingId: 'c', otherId: 'd', fraction: expect.closeTo(0.3) },
    ])
  })

  it('uses the threshold from the settings', () => {
    const project = design([at('a', shrub.id, 2), at('b', shrub.id, 2.85)])
    const strict = { ...project, settings: { ...project.settings, overlapThreshold: 0.1 } }
    expect(plantingWarnings(strict)).toHaveLength(1)
  })

  it('lets hedging plants overlap each other, but not other plants', () => {
    const warnings = plantingWarnings(
      design([at('h1', hedge.id, 2), at('h2', hedge.id, 2.3), at('s', shrub.id, 2.9)]),
    )
    expect(warnings.map((w) => w.kind === 'overlap' && [w.plantingId, w.otherId])).toEqual([
      ['h2', 's'],
    ])
  })

  it('checks sizes with a given radius (e.g. a growth year)', () => {
    const project = design([at('a', big.id, 2), at('b', big.id, 3.5)])
    expect(plantingWarnings(project)).toHaveLength(1)
    expect(plantingWarnings(project, { radiusM: () => 0.5 })).toHaveLength(0)
  })

  it('warns about plants outside the plot (only once there is a plot)', () => {
    const project = design([at('in', shrub.id, 5), at('out', shrub.id, 25)])
    expect(plantingWarnings(project)).toEqual([{ kind: 'outside-plot', plantingId: 'out' }])
    expect(plantingWarnings({ ...project, plot: { outline: [] } })).toEqual([])
  })

  it('warns about the soil: unsuited, or too dry on sand', () => {
    const project = design([at('clay', clayPlant.id, 2), at('dry', thirsty.id, 6)])
    expect(plantingWarnings(project)).toEqual([
      { kind: 'soil', plantingId: 'clay', suitability: 'unsuited' },
      { kind: 'soil', plantingId: 'dry', suitability: 'dry' },
    ])
    const onClay = { ...project, settings: { ...project.settings, soil: 'clay' as const } }
    // On clay the thirsty plant (sand only) doesn't suit; the clay plant is fine.
    expect(plantingWarnings(onClay)).toEqual([
      { kind: 'soil', plantingId: 'dry', suitability: 'unsuited' },
    ])
  })

  it('ignores the soil of plants that no longer exist', () => {
    expect(plantingWarnings(design([at('x', 'custom-gone', 5)]))).toEqual([])
  })

  it('is remembered per project version and growth view', () => {
    const project = design([at('clay', clayPlant.id, 2)])
    expect(designWarnings(project)).toBe(designWarnings(project))
    expect(designWarnings(project, 2027)).toBe(designWarnings(project, 2027))
    expect(designWarnings(project, 2027)).not.toBe(designWarnings(project))
  })
})

describe('plantingWarnings in a growth year', () => {
  // Two 1 m shrubs 0.6 m apart (planted 2027, mature after 3 years): 40% overlap when grown,
  // but at 0.3 m across when planted they don't touch.
  const project = design([at('a', shrub.id, 2), at('b', shrub.id, 2.6)])
  const overlaps = (view?: number | 'mature') =>
    plantingWarnings(project, view === undefined ? {} : { view }).filter(
      (w) => w.kind === 'overlap',
    )

  it('checks overlaps at the mature size by default', () => {
    expect(overlaps()).toHaveLength(1)
    expect(overlaps('mature')).toEqual(overlaps())
  })

  it('checks overlaps at the size in the viewed year', () => {
    expect(overlaps(2027)).toEqual([])
    expect(overlaps(2028)).toEqual([])
    expect(overlaps(2030)).toHaveLength(1)
  })

  it('leaves out plants that are not in the ground yet, but still checks where they are', () => {
    const later = design([
      at('a', shrub.id, 2),
      { ...at('b', shrub.id, 2.1), plantedYear: 2029 },
      { ...at('c', clayPlant.id, 9), plantedYear: 2029 },
    ])
    const warnings = plantingWarnings(later, { view: 2028 })
    expect(warnings.map((w) => [w.kind, w.plantingId])).toEqual([['soil', 'c']])
    expect(plantingWarnings(later, { view: 2029 }).map((w) => w.kind)).toContain('overlap')
  })
})

describe('warnings per planting and grouped', () => {
  const project = design([
    at('a', shrub.id, 2),
    at('b', shrub.id, 2.6),
    at('c', shrub.id, 3.2),
    at('d', clayPlant.id, 9),
    at('e', clayPlant.id, 12),
    at('f', big.id, 30),
  ])
  const warnings = plantingWarnings(project)

  it('lists an overlap under both plants', () => {
    const byPlanting = warningsByPlanting(warnings)
    expect(byPlanting.get('a')).toHaveLength(1)
    expect(byPlanting.get('b')).toHaveLength(2)
    expect(byPlanting.get('c')).toHaveLength(1)
  })

  it('groups by kind and species, with every planting involved', () => {
    const groups = groupWarnings(project, warnings)
    expect(groups.map((g) => [g.kind, g.plantIds, g.count, [...g.plantingIds].sort()])).toEqual([
      ['overlap', [shrub.id], 2, ['a', 'b', 'c']],
      ['soil', [clayPlant.id], 2, ['d', 'e']],
      ['outside-plot', [big.id], 1, ['f']],
    ])
    expect(groups[1]!.suitability).toBe('unsuited')
  })
})

describe('sun warnings', () => {
  const grid = { originX: 0, originY: 0, cellM: 1, cols: 20, rows: 10 }
  /** Hours per cell: `hoursAt(x, y)`. */
  const mapOf = (hoursAt: (x: number, y: number) => number) => ({
    grid,
    hours: Float32Array.from({ length: 200 }, (_, i) => hoursAt(i % 20, Math.floor(i / 20))),
  })
  const herb: Plant = {
    ...samplePlant,
    id: 'custom-herb',
    category: 'perennial',
    sun: ['full-sun'],
  }
  const lover: Plant = { ...herb, id: 'custom-lover', sun: ['part-shade', 'shade'] }
  const sunny = (plantings: Planting[]) => ({
    ...design(plantings),
    customPlants: [herb, lover, samplePlant],
  })

  it('a full-sun plant on a shaded spot gets a sun warning', () => {
    const project = sunny([at('a', 'custom-herb', 2.5)])
    const warnings = plantingWarnings(project, { sunMap: mapOf(() => 1) })
    expect(warnings).toEqual([{ kind: 'sun', plantingId: 'a', level: 'shade', far: true }])
    expect(warningSeverity(warnings[0]!)).toBe('warning')
    const groups = groupWarnings(project, warnings)
    expect(groups[0]).toMatchObject({ key: 'sun:shade:custom-herb', level: 'shade' })
  })

  it('a one-step mismatch is a notice', () => {
    const project = sunny([at('a', 'custom-herb', 2.5)])
    const [warning] = plantingWarnings(project, { sunMap: mapOf(() => 4) })
    expect(warning).toMatchObject({ kind: 'sun', level: 'part-shade', far: false })
    expect(warningSeverity(warning!)).toBe('notice')
    // The thresholds are a design setting.
    const strict = {
      ...project,
      settings: { ...project.settings, sunThresholds: { fullSunHours: 4, partShadeHours: 1 } },
    }
    expect(plantingWarnings(strict, { sunMap: mapOf(() => 4) })).toEqual([])
    // A shade lover is fine in full sun only when it accepts it.
    const lov = sunny([at('b', 'custom-lover', 2.5)])
    expect(plantingWarnings(lov, { sunMap: mapOf(() => 9) })[0]).toMatchObject({
      level: 'full-sun',
      far: false,
    })
  })

  it('no sun warning without a map, for existing plantings or for plants that cast shade', () => {
    const shaded = mapOf(() => 1)
    expect(plantingWarnings(sunny([at('a', 'custom-herb', 2.5)]))).toEqual([])
    const existing = { ...at('a', 'custom-herb', 2.5), status: 'existing' as const }
    expect(plantingWarnings(sunny([existing]), { sunMap: shaded })).toEqual([])
    // samplePlant is a 0.6 m shrub: it shades its own spot.
    expect(plantingWarnings(sunny([at('a', 'custom-lavender', 2.5)]), { sunMap: shaded })).toEqual(
      [],
    )
    // Not in the ground yet in the viewed year.
    expect(
      plantingWarnings(sunny([at('a', 'custom-herb', 2.5)]), { sunMap: shaded, view: 2026 }),
    ).toEqual([])
    // designWarnings follows the map it is given.
    const project = sunny([at('a', 'custom-herb', 2.5)])
    expect(designWarnings(project, 'mature', shaded)).toHaveLength(1)
    expect(designWarnings(project, 'mature', null)).toHaveLength(0)
  })
})

describe('structure overlaps', () => {
  const box = (x: number, y: number, w: number, h: number): Shape => ({
    type: 'polygon',
    points: [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ],
  })
  const fenceLine = (x: number, thicknessM = 0.1): Shape => ({
    type: 'polyline',
    points: [
      { x, y: 0 },
      { x, y: 10 },
    ],
    thicknessM,
  })
  const object = (
    id: string,
    kind: ObjectKind,
    shape: Shape,
    status: GardenObject['status'] = 'new',
  ): GardenObject => ({ id, kind, shape, status, layer: 'hardscape' })
  const withObjects = (project: Project, ...objects: GardenObject[]): Project => ({
    ...project,
    objects: [...project.objects, ...objects],
  })
  const objectWarnings = (project: Project, view?: number | 'mature') =>
    plantingWarnings(project, view === undefined ? {} : { view }).filter(
      (w) => w.kind === 'overlap-object',
    )
  // A 1 m shrub (radius 0.5) at x = 5 next to a structure whose edge is at x = 5 + offset.

  it('measures how far a plant reaches into a structure, as a fraction of its diameter', () => {
    const c = { x: 5, y: 5, r: 0.5 }
    const terrace = (left: number) => box(left, 0, 5, 10)
    expect(structureOverlapFraction(c, terrace(6))).toBe(0)
    expect(structureOverlapFraction(c, terrace(5.5))).toBe(0)
    expect(structureOverlapFraction(c, terrace(5))).toBeCloseTo(0.5)
    expect(structureOverlapFraction(c, terrace(5.3))).toBeCloseTo(0.2)
    expect(structureOverlapFraction(c, terrace(2))).toBe(1)
    // A fence's thickness counts: its edge is 0.2 m from the line.
    expect(structureOverlapFraction(c, fenceLine(5.6, 0.4))).toBeCloseTo(0.1)
    expect(structureOverlapFraction(c, fenceLine(5.6, 0.1))).toBe(0)
    expect(structureOverlapFraction(c, { type: 'point', position: c, rotationDeg: 0 })).toBe(0)
  })

  it('warns when a plant grows over a building, wall, fence or paving beyond the threshold', () => {
    const kinds: ObjectKind[] = ['house', 'shed', 'greenhouse', 'carport', 'terrace', 'path']
    for (const kind of kinds) {
      const project = withObjects(
        design([at('a', shrub.id, 5)]),
        object('o', kind, box(5.2, 0, 3, 10)),
      )
      expect(objectWarnings(project)).toEqual([
        { kind: 'overlap-object', plantingId: 'a', objectId: 'o', fraction: expect.any(Number) },
      ])
    }
    for (const kind of ['wall', 'fence', 'gate', 'driveway'] as ObjectKind[]) {
      const shape = kind === 'driveway' ? box(5.2, 0, 3, 10) : fenceLine(5.2)
      const project = withObjects(design([at('a', shrub.id, 5)]), object('o', kind, shape))
      expect(objectWarnings(project)).toHaveLength(1)
    }
    // 0.1 of the diameter is not beyond the 0.2 threshold; clear of it is fine.
    const edge = withObjects(
      design([at('a', shrub.id, 5)]),
      object('o', 'house', box(5.4, 0, 3, 10)),
    )
    expect(objectWarnings(edge)).toEqual([])
    const clear = withObjects(
      design([at('a', shrub.id, 5)]),
      object('o', 'house', box(6, 0, 3, 10)),
    )
    expect(objectWarnings(clear)).toEqual([])
    expect(
      warningSeverity(
        objectWarnings(
          withObjects(design([at('a', shrub.id, 5)]), object('o', 'house', box(4, 0, 3, 10))),
        )[0]!,
      ),
    ).toBe('warning')
  })

  it('ignores beds, lawn, gravel, ponds, hedges, pergolas, raised beds and symbols', () => {
    const kinds: ObjectKind[] = [
      'bed-ornamental',
      'bed-vegetable',
      'raised-bed',
      'lawn',
      'gravel',
      'pond',
      'hedge',
      'pergola',
    ]
    for (const kind of kinds) {
      const project = withObjects(
        design([at('a', shrub.id, 5)]),
        object('o', kind, box(4, 0, 3, 10)),
      )
      expect(objectWarnings(project), kind).toEqual([])
    }
    const symbol: Shape = { type: 'point', position: { x: 5, y: 5 }, rotationDeg: 0 }
    expect(
      objectWarnings(withObjects(design([at('a', shrub.id, 5)]), object('o', 'furniture', symbol))),
    ).toEqual([])
  })

  it('lets climbers grow against structures', () => {
    const climber: Plant = { ...shrub, id: 'custom-climber', category: 'climber' }
    const project = withObjects(
      { ...design([at('a', climber.id, 5), at('b', shrub.id, 8)]), customPlants: [climber, shrub] },
      object('o', 'house', box(4, 0, 6, 10)),
    )
    expect(objectWarnings(project).map((w) => w.plantingId)).toEqual(['b'])
  })

  it('checks at the size in the viewed year and skips plants not in the ground yet', () => {
    const project = withObjects(
      design([at('a', shrub.id, 5)]),
      object('o', 'house', box(5.2, 0, 3, 10)),
    )
    expect(objectWarnings(project, 2027)).toEqual([])
    expect(objectWarnings(project, 2030)).toHaveLength(1)
    const later = withObjects(
      design([{ ...at('a', shrub.id, 5), plantedYear: 2030 }]),
      object('o', 'house', box(5.2, 0, 3, 10)),
    )
    expect(objectWarnings(later, 2028)).toEqual([])
    expect(objectWarnings(later, 2033)).toHaveLength(1)
  })

  it('skips an existing plant by an existing structure, not a new one', () => {
    const old = { ...at('a', shrub.id, 5), status: 'existing' as const }
    const house = (status: GardenObject['status']) =>
      object('o', 'house', box(5.2, 0, 3, 10), status)
    expect(objectWarnings(withObjects(design([old]), house('existing')))).toEqual([])
    expect(objectWarnings(withObjects(design([old]), house('new')))).toHaveLength(1)
    expect(
      objectWarnings(withObjects(design([at('a', shrub.id, 5)]), house('existing'))),
    ).toHaveLength(1)
  })

  it('counts structures outside the plot', () => {
    const project = withObjects(
      design([at('a', shrub.id, 19.8)]),
      object('o', 'shed', box(20, 0, 3, 10)),
    )
    expect(objectWarnings(project)).toHaveLength(1)
  })

  it('groups per species and kind of structure, under the plant only', () => {
    const project = withObjects(
      design([at('a', shrub.id, 5), at('b', shrub.id, 8, 5), at('c', big.id, 12)]),
      object('h', 'house', box(4, 0, 6, 10)),
      object('t', 'terrace', box(11.5, 0, 3, 10)),
    )
    const warnings = objectWarnings(project)
    const groups = groupWarnings(project, warnings)
    expect(groups.map((g) => [g.key, g.objectKind, g.count])).toEqual([
      ['overlap-object:house:custom-shrub', 'house', 2],
      ['overlap-object:terrace:custom-big', 'terrace', 1],
    ])
    const byPlanting = warningsByPlanting(warnings)
    expect(byPlanting.get('o')).toBeUndefined()
    expect(byPlanting.get('a')).toHaveLength(1)
  })

  it('stays fast for 1000 plantings and 100 structures', () => {
    const plantings = Array.from({ length: 1000 }, (_, i) =>
      at(`p${i}`, shrub.id, (i % 40) * 2.5, Math.floor(i / 40) * 4),
    )
    const objects = Array.from({ length: 100 }, (_, i) =>
      object(`o${i}`, 'terrace', box((i % 10) * 10 + 1, Math.floor(i / 10) * 10 + 1, 2, 2)),
    )
    const project = withObjects(design(plantings), ...objects)
    const start = performance.now()
    plantingWarnings(project)
    expect(performance.now() - start).toBeLessThan(500)
  })
})
