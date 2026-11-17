import { describe, expect, it } from 'vitest'
import { samplePlant } from '../test/fixtures'
import { newProject } from './defaults'
import { itemAt } from './hitTest'
import type { GardenObject, LayerId, Plant, Planting, Project } from './schema'
import type { PlantView } from '../styles/plantAppearance'

const view: PlantView = { year: 'mature', month: null }
/** Radius 0.3 m. */
const shrub: Plant = { ...samplePlant, id: 'custom-shrub', spreadM: 0.6 }
/** Radius 3 m, drawn as a canopy over everything. */
const tree: Plant = { ...samplePlant, id: 'custom-tree', category: 'tree', spreadM: 6, heightM: 8 }

const square = (x: number, y: number, size: number) => [
  { x, y },
  { x: x + size, y },
  { x: x + size, y: y + size },
  { x, y: y + size },
]

const bed: GardenObject = {
  id: 'bed',
  kind: 'bed-ornamental',
  shape: { type: 'polygon', points: square(2, 2, 4) },
  status: 'new',
  layer: 'plants',
}
const fence: GardenObject = {
  id: 'fence',
  kind: 'fence',
  shape: {
    type: 'polyline',
    points: [
      { x: 0, y: 9 },
      { x: 10, y: 9 },
    ],
    thicknessM: 0.1,
  },
  status: 'new',
  layer: 'hardscape',
}
const plant = (id: string, plantId: string, x: number, y: number): Planting => ({
  id,
  plantId,
  position: { x, y },
  plantedYear: 2026,
})

function design(hidden: LayerId[] = []): Project {
  const project = newProject('Hits', 0)
  const layers = { ...project.layers }
  for (const layer of hidden) layers[layer] = { ...layers[layer], visible: false }
  return {
    ...project,
    layers,
    plot: { outline: square(0, 0, 10) },
    customPlants: [shrub, tree],
    objects: [bed, fence],
    plantings: [plant('rose', shrub.id, 4, 4), plant('oak', tree.id, 5, 4)],
  }
}

const options = { view, toleranceM: 0.2 }

describe('itemAt', () => {
  it('finds a planting within the tap tolerance', () => {
    const project = { ...design(), objects: [], plantings: [plant('rose', shrub.id, 4, 4)] }
    expect(itemAt(project, { x: 4.25, y: 4 }, options)).toEqual({ type: 'planting', id: 'rose' })
    // A tiny plant is still hit within the tolerance.
    const tiny = { ...shrub, spreadM: 0.05 }
    const small = { ...project, customPlants: [tiny] }
    expect(itemAt(small, { x: 4.15, y: 4 }, options)).toEqual({ type: 'planting', id: 'rose' })
    expect(itemAt(small, { x: 4.3, y: 4 }, options)).toEqual({ type: 'plot' })
  })

  it('prefers a plant over its bed and over a tree canopy above it', () => {
    const project = design()
    expect(itemAt(project, { x: 4, y: 4.1 }, options)).toEqual({ type: 'planting', id: 'rose' })
    // Inside the bed but outside the rose: the bed is smaller than the tree's canopy.
    expect(itemAt(project, { x: 3, y: 3 }, options)).toEqual({ type: 'object', id: 'bed' })
    // Under the canopy, outside the bed.
    expect(itemAt(project, { x: 7, y: 4 }, options)).toEqual({ type: 'planting', id: 'oak' })
  })

  it('hits a line within half its thickness plus the tolerance', () => {
    const project = design()
    expect(itemAt(project, { x: 1, y: 9.24 }, options)).toEqual({ type: 'object', id: 'fence' })
    expect(itemAt(project, { x: 1, y: 9.3 }, options)).toEqual({ type: 'plot' })
  })

  it('ignores items on hidden layers', () => {
    const project = design(['plants', 'hardscape'])
    expect(itemAt(project, { x: 4, y: 4 }, options)).toEqual({ type: 'plot' })
    expect(itemAt(project, { x: 1, y: 9 }, options)).toEqual({ type: 'plot' })
  })

  it('falls back to the plot, then nothing outside it', () => {
    const project = design()
    expect(itemAt(project, { x: 1, y: 1 }, options)).toEqual({ type: 'plot' })
    expect(itemAt(project, { x: 12, y: 12 }, options)).toBeNull()
    expect(itemAt(design(['existing']), { x: 1, y: 1 }, options)).toBeNull()
  })
})
