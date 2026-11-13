import { newId } from './ids'
import {
  LAYER_IDS,
  PROJECT_NAME_MAX_LENGTH,
  type Layers,
  type Project,
  SCHEMA_VERSION,
  type Settings,
} from './schema'

/** Defaults for a new design: sandy soil, centre of the Netherlands, north up, 0.5 m grid. */
export const DEFAULT_SETTINGS: Settings = {
  location: { lat: 52.13, lng: 5.29 },
  northAngleDeg: 0,
  gridSizeM: 0.5,
  soil: 'sand',
}

export function defaultLayers(): Layers {
  return Object.fromEntries(LAYER_IDS.map((id) => [id, { visible: true, locked: false }])) as Layers
}

/** Trims and collapses whitespace and caps the length. Returns '' when nothing is left. */
export function normaliseName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, PROJECT_NAME_MAX_LENGTH).trim()
}

export function newProject(name: string, now = Date.now()): Project {
  const cleanName = normaliseName(name)
  if (!cleanName) throw new Error('A project needs a name')

  return {
    id: newId(),
    name: cleanName,
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    settings: structuredClone(DEFAULT_SETTINGS),
    plot: { outline: [] },
    objects: [],
    plantings: [],
    customPlants: [],
    layers: defaultLayers(),
  }
}
