import { LAYER_IDS, type LayerId, type Project } from '../../model/schema'

/** The layers a phone can toggle: no shadows (the viewer draws none), no site plan without one. */
export function viewerLayers(project: Project): LayerId[] {
  return LAYER_IDS.filter(
    (id) => id !== 'shadows' && (id !== 'background' || project.background !== undefined),
  )
}

/** The project as drawn, with some layers shown or hidden. Never saved. */
export function withLayerVisibility(
  project: Project,
  overrides: Partial<Record<LayerId, boolean>>,
): Project {
  const entries = Object.entries(overrides) as [LayerId, boolean][]
  if (entries.length === 0) return project
  const layers = { ...project.layers }
  for (const [id, visible] of entries) layers[id] = { ...layers[id], visible }
  return { ...project, layers }
}
