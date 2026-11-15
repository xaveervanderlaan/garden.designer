import { bedsOf } from './beds'
import { findPlant } from './plants'
import { speciesCodes } from './plantings'
import type { Plant, Project } from './schema'

/** The planting list: how many of each plant the design needs, in total or per bed. */

export type PlantingListRow = {
  plantId: string
  /** Undefined for a plant that no longer exists (e.g. a deleted custom plant). */
  plant: Plant | undefined
  /** Species code, as on the plan's labels. */
  code: number
  count: number
}

export type PlantingListGroup = {
  /** The bed, or null for plants that aren't in a bed. */
  bedId: string | null
  rows: PlantingListRow[]
  total: number
}

function rowsFor(project: Project, plantIds: Iterable<string>): PlantingListRow[] {
  const codes = speciesCodes(project)
  const counts = new Map<string, number>()
  for (const id of plantIds) counts.set(id, (counts.get(id) ?? 0) + 1)
  return [...counts]
    .map(([plantId, count]) => ({
      plantId,
      plant: findPlant(project, plantId),
      code: codes.get(plantId) ?? 0,
      count,
    }))
    .sort((a, b) => a.code - b.code)
}

/** Count per species for the whole design, ordered by species code. */
export function plantingList(project: Project): PlantingListRow[] {
  return rowsFor(
    project,
    project.plantings.map((p) => p.plantId),
  )
}

/**
 * Count per species for each bed (in drawing order, beds without plants left out), then the plants
 * that aren't in any bed.
 */
export function plantingListByBed(project: Project): PlantingListGroup[] {
  const groups: PlantingListGroup[] = []
  const add = (bedId: string) => {
    const plantIds = project.plantings.filter((p) => p.bedId === bedId).map((p) => p.plantId)
    if (plantIds.length === 0) return
    groups.push({ bedId, rows: rowsFor(project, plantIds), total: plantIds.length })
  }
  const bedIds = new Set(bedsOf(project).map((b) => b.id))
  for (const id of bedIds) add(id)
  // Plants linked to a bed that no longer exists count as "not in a bed".
  const orphans = project.plantings.filter((p) => !p.bedId || !bedIds.has(p.bedId))
  if (orphans.length) {
    groups.push({
      bedId: null,
      rows: rowsFor(
        project,
        orphans.map((p) => p.plantId),
      ),
      total: orphans.length,
    })
  }
  return groups
}
