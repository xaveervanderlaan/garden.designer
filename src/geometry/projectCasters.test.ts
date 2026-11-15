import { describe, expect, it } from 'vitest'
import { newProject } from '../model/defaults'
import { builtInPlant } from '../data/plants'
import type { GardenObject, Planting, Project } from '../model/schema'
import { samplePlant } from '../test/fixtures'
import { canopyBaseFraction, objectCaster, plantingCaster, projectCasters } from './projectCasters'
import { castShadows, multiPolygonArea } from './shadows'

const object = (overrides: Partial<GardenObject>): GardenObject => ({
  id: 'object',
  kind: 'shed',
  layer: 'hardscape',
  shape: {
    type: 'polygon',
    points: [
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 3, y: 2 },
      { x: 0, y: 2 },
    ],
  },
  ...overrides,
})

const planting = (plantId: string, id = plantId): Planting => ({
  id,
  plantId,
  position: { x: 5, y: 5 },
  plantedYear: 2026,
})

function project(): Project {
  const p = newProject('Shade test', 0)
  p.customPlants = [{ ...samplePlant, heightM: 1.2, spreadM: 1 }]
  return p
}

describe('casters from a design', () => {
  it('uses every object with a height', () => {
    expect(objectCaster(object({ heightM: 2.5 }))).toMatchObject({
      kind: 'prism',
      heightM: 2.5,
      baseM: 0,
      sourceId: 'object',
    })
    expect(objectCaster(object({}))).toBeNull()
    const fence = objectCaster(
      object({
        kind: 'fence',
        heightM: 1.8,
        shape: {
          type: 'polyline',
          points: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
          ],
          thicknessM: 0.1,
        },
      }),
    )
    expect(fence).toMatchObject({ kind: 'prism', heightM: 1.8 })
    // Sun at 45° in the south: the fence's shadow is 10 m × 1.8 m (plus its own width).
    expect(multiPolygonArea(castShadows([fence!], { x: 0, y: -1 }))).toBeCloseTo(19, 0)
    expect(
      objectCaster(
        object({
          kind: 'rain-barrel',
          heightM: 1,
          shape: { type: 'point', position: { x: 1, y: 2 }, rotationDeg: 0 },
        }),
      ),
    ).toMatchObject({ kind: 'canopy', centre: { x: 1, y: 2 }, baseM: 0, topM: 1 })
  })

  it('treats pergolas and carports as roofs on posts', () => {
    expect(objectCaster(object({ kind: 'carport', heightM: 2.5 }))).toMatchObject({
      kind: 'prism',
      baseM: 2.2,
      heightM: 2.5,
    })
  })

  it('gives trees a raised canopy and shrubs a canopy from the ground', () => {
    const design = project()
    const birch = builtInPlant('betula-pendula')!
    expect(plantingCaster(design, planting('betula-pendula'))).toEqual({
      kind: 'canopy',
      centre: { x: 5, y: 5 },
      radiusM: birch.spreadM / 2,
      baseM: birch.heightM / 3,
      topM: birch.heightM,
      sourceId: 'betula-pendula',
    })
    expect(plantingCaster(design, planting('cornus-mas'))).toMatchObject({ baseM: 0, topM: 5 })
    expect(canopyBaseFraction(builtInPlant('malus-domestica')!)).toBeCloseTo(1 / 3) // fruit tree
    expect(canopyBaseFraction(builtInPlant('ribes-rubrum')!)).toBe(0) // fruit bush
    expect(plantingCaster(design, planting(samplePlant.id))).toMatchObject({ topM: 1.2 })
  })

  it('skips low plants, other categories and unknown plants', () => {
    const design = project()
    expect(plantingCaster(design, planting('verbena-bonariensis'))).toBeNull() // a perennial
    expect(plantingCaster(design, planting('custom-gone'))).toBeNull()
    expect(plantingCaster(design, planting(samplePlant.id), { minPlantHeightM: 1.5 })).toBeNull()
  })

  it('can use the size for a given year', () => {
    const young = plantingCaster(project(), planting('betula-pendula'), {
      plantSize: () => ({ heightM: 3, spreadM: 1 }),
    })
    expect(young).toMatchObject({ radiusM: 0.5, baseM: 1, topM: 3 })
  })

  it('collects the casters of a whole design', () => {
    const design = project()
    design.objects = [object({ id: 'shed', heightM: 2 }), object({ id: 'terrace' })]
    design.plantings = [planting('betula-pendula', 'tree'), planting('verbena-bonariensis', 'p')]
    expect(projectCasters(design).map((caster) => caster.sourceId)).toEqual(['shed', 'tree'])
  })
})
