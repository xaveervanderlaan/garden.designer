import { describe, expect, it } from 'vitest'
import { samplePlant } from '../test/fixtures'
import { newProject } from './defaults'
import type { Plant, Planting, Project } from './schema'
import {
  designWarnings,
  findOverlaps,
  groupWarnings,
  overlapFraction,
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

  it('is remembered per project version', () => {
    const project = design([at('clay', clayPlant.id, 2)])
    expect(designWarnings(project)).toBe(designWarnings(project))
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
