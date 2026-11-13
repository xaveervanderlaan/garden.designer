import { newProject } from '../model/defaults'
import { newId } from '../model/ids'
import type { Plant, Project } from '../model/schema'
import type { AssetRecord } from '../persistence/db'

export const samplePlant: Plant = {
  id: 'custom-lavender',
  names: { nl: 'Lavendel', en: 'Lavender', latin: 'Lavandula angustifolia' },
  category: 'shrub',
  heightM: 0.6,
  spreadM: 0.6,
  yearsToMature: 3,
  evergreen: true,
  sun: ['full-sun'],
  soil: ['sand'],
  droughtTolerant: true,
  bloomMonths: [6, 7, 8],
  flowerColor: 'purple',
  foliageColor: 'grey-green',
  nativeNL: false,
  wildlife: ['bees', 'butterflies'],
  toxic: false,
  verified: false,
}

/** A project with some content in every part of the model, plus one background asset. */
export function sampleProjectWithAsset(name = 'Back garden'): {
  project: Project
  asset: AssetRecord
} {
  const project = newProject(name, 1_700_000_000_000)
  const asset: AssetRecord = {
    id: `asset-${newId()}`,
    projectId: project.id,
    mimeType: 'image/png',
    data: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 255]).buffer,
    createdAt: 1_700_000_000_000,
  }
  project.plot.outline = [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 15 },
    { x: 0, y: 15 },
  ]
  project.background = {
    assetId: asset.id,
    widthPx: 1200,
    heightPx: 800,
    fileName: 'site-plan.pdf',
    page: 1,
    metresPerPixel: 0.02,
    offset: { x: -1, y: -2 },
    rotationDeg: 3,
    opacity: 0.6,
    calibration: { a: { x: 100, y: 700 }, b: { x: 600, y: 700 }, distanceM: 10 },
  }
  project.objects = [
    {
      id: 'bed-1',
      kind: 'bed-ornamental',
      shape: {
        type: 'polygon',
        points: [
          { x: 1, y: 1 },
          { x: 5, y: 1 },
          { x: 5, y: 3 },
        ],
      },
      layer: 'plants',
      label: 'Border',
    },
  ]
  project.plantings = [
    {
      id: 'p-1',
      plantId: samplePlant.id,
      position: { x: 2, y: 2 },
      bedId: 'bed-1',
      plantedYear: 2027,
    },
  ]
  project.customPlants = [samplePlant]
  return { project, asset }
}
