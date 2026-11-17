import { acrossRows, defaultRowAngle, layoutRows, normaliseRowAngle } from '../geometry/rows'
import type { Fill } from '../store/uiStore'
import { type Bed, findBed, isBed } from './beds'
import { MAX_FILL_PLANTS, fillBedPositions } from './plantings'
import { findPlant } from './plants'
import type { GardenObject, Planting, Point, Project } from './schema'

/** Bed kinds whose crops are planted in rows. */
export const ROW_BED_KINDS = ['bed-vegetable', 'raised-bed'] as const

export function isRowBed(object: GardenObject): object is Bed {
  return isBed(object) && (ROW_BED_KINDS as readonly string[]).includes(object.kind)
}

/** The row direction of a bed: the chosen one, else along its longest edge. */
export function bedRowAngle(bed: Bed): number {
  return bed.rowAngleDeg ?? defaultRowAngle(bed.shape.points)
}

/** Sets a row bed's row direction (normalised to [0, 180)); the same project when nothing changes. */
export function setBedRowAngle(project: Project, id: string, angleDeg: number): Project {
  const bed = project.objects.find((o) => o.id === id)
  if (!bed || !isRowBed(bed) || !Number.isFinite(angleDeg)) return project
  const angle = normaliseRowAngle(angleDeg)
  if (bed.rowAngleDeg === angle) return project
  return {
    ...project,
    objects: project.objects.map((o) => (o.id === id ? { ...o, rowAngleDeg: angle } : o)),
  }
}

/** The bed id when the planting is a crop (plant with `veg` data) in a row bed. */
export function isRowCrop(project: Project, planting: Planting): string | undefined {
  if (planting.bedId === undefined) return undefined
  if (!findPlant(project, planting.plantId)?.veg) return undefined
  const bed = project.objects.find((o) => o.id === planting.bedId)
  return bed && isRowBed(bed) ? bed.id : undefined
}

/** How far across the rows the bed is already used (to the far side of the last row), or null. */
export function occupiedAcrossM(project: Project, bed: Bed, angleDeg: number): number | null {
  let occupied: number | null = null
  for (const planting of project.plantings) {
    if (planting.bedId !== bed.id) continue
    const plant = findPlant(project, planting.plantId)
    const end =
      acrossRows(planting.position, angleDeg) + (plant?.veg?.rowSpacingM ?? plant?.spreadM ?? 0) / 2
    occupied = occupied === null ? end : Math.max(occupied, end)
  }
  return occupied
}

/** Whether filling `bedId` with `plantId` lays rows (a crop in a row bed). */
export function isRowFill(project: Project, plantId: string, bedId: string | null): boolean {
  const bed = bedId === null ? undefined : findBed(project, bedId)
  return !!bed && isRowBed(bed) && !!findPlant(project, plantId)?.veg
}

/** Starting spacings for a fill: the crop's row data in rows mode, else its spread. */
export function fillDefaults(
  project: Project,
  plantId: string,
  bedId: string | null,
): { spacingM: number; rowSpacingM?: number } {
  const plant = findPlant(project, plantId)
  if (plant?.veg && isRowFill(project, plantId, bedId)) {
    return { spacingM: plant.veg.inRowSpacingM, rowSpacingM: plant.veg.rowSpacingM }
  }
  return { spacingM: plant?.spreadM ?? 0.5 }
}

export type BedFill = {
  positions: Point[]
  tooMany: boolean
  rowMode: boolean
  rowCount: number
}

/** Where a fill puts its plants: in rows for crops in row beds, else staggered. */
export function bedFill(project: Project, fill: Fill): BedFill {
  const bed = fill.bedId === null ? undefined : findBed(project, fill.bedId)
  if (!bed || !isRowFill(project, fill.plantId, fill.bedId)) {
    const staggered =
      fill.bedId === null
        ? { positions: [], tooMany: false }
        : fillBedPositions(project, fill.bedId, fill.plantId, fill.spacingM)
    return { ...staggered, rowMode: false, rowCount: 0 }
  }
  const angleDeg = bedRowAngle(bed)
  const plant = findPlant(project, fill.plantId)
  const occupied = occupiedAcrossM(project, bed, angleDeg)
  const pieces = layoutRows(bed.shape.points, {
    angleDeg,
    rowSpacingM: fill.rowSpacingM ?? plant?.veg?.rowSpacingM ?? fill.spacingM,
    inRowSpacingM: fill.spacingM,
    maxRows: fill.rows,
    maxPositions: MAX_FILL_PLANTS + 1,
    startAcrossM: occupied ?? (fill.rows ? -Infinity : undefined),
  })
  const positions = pieces.flatMap((piece) => piece.positions)
  if (positions.length > MAX_FILL_PLANTS) {
    return { positions: [], tooMany: true, rowMode: true, rowCount: 0 }
  }
  return {
    positions,
    tooMany: false,
    rowMode: true,
    rowCount: new Set(pieces.filter((p) => p.positions.length > 0).map((p) => p.row)).size,
  }
}
