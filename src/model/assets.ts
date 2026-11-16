import type { Project } from './schema'

/**
 * Ids of the assets the project uses; anything else stored for it can be removed. Kept apart from
 * background.ts (which re-exports it), so storage code doesn't pull in the geometry and the plant
 * data, and the project list stays small (the editor is loaded lazily).
 */
export function assetIdsInUse(project: Project): Set<string> {
  return new Set(project.background ? [project.background.assetId] : [])
}
