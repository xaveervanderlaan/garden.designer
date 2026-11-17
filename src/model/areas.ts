import { areaWithin } from '../geometry/clip'
import { labelPoint, polygonArea } from '../geometry/polygon'
import { formatArea } from '../i18n/units'
import { isLayerVisible } from './edit'
import { objectsOnTop, surfaceAreas } from './netArea'
import { objectBand } from './drawOrder'
import { MATERIAL_IDS, materialOf, type MaterialId } from './objectKinds'
import {
  OBJECT_KINDS,
  type GardenObject,
  type ObjectKind,
  type Point,
  type Project,
} from './schema'

export const AREA_GROUPS = ['paved', 'green', 'water', 'beds', 'buildings'] as const
export type AreaGroup = (typeof AREA_GROUPS)[number]

const GROUP_OF: Partial<Record<ObjectKind, AreaGroup>> = {
  terrace: 'paved',
  path: 'paved',
  driveway: 'paved',
  gravel: 'paved',
  lawn: 'green',
  pond: 'water',
  'bed-ornamental': 'beds',
  'bed-vegetable': 'beds',
  'raised-bed': 'beds',
  house: 'buildings',
  shed: 'buildings',
  greenhouse: 'buildings',
  carport: 'buildings',
  pergola: 'buildings',
}

/** Area on the plan label: surfaces net, other polygons gross, anything else null. */
export function objectArea(project: Project, object: GardenObject): number | null {
  if (object.shape.type !== 'polygon') return null
  return surfaceAreas(project, object.id)?.netM2 ?? polygonArea(object.shape.points)
}

export type AreaRow = {
  kind: ObjectKind
  material: MaterialId | null
  count: number
  areaM2: number
}

export type AreaTotals = {
  plotM2: number | null
  groups: { group: AreaGroup; totalM2: number; rows: AreaRow[] }[]
}

/** Totals per group, kind and material, counting only what lies inside the plot (if drawn). */
export function areaTotals(project: Project): AreaTotals {
  const outline = project.plot.outline
  const within: readonly Point[] | null = outline.length >= 3 ? outline : null
  const rows = new Map<string, AreaRow & { group: AreaGroup }>()
  for (const object of project.objects) {
    const group = GROUP_OF[object.kind]
    if (!group || object.shape.type !== 'polygon') continue
    const clips =
      objectBand(object) === 'surface'
        ? objectsOnTop(project, object).map((o) => (o.shape as { points: Point[] }).points)
        : []
    const areaM2 = areaWithin(object.shape.points, within, clips)
    const material = materialOf(object)
    const key = `${object.kind}|${material ?? ''}`
    const row = rows.get(key) ?? { group, kind: object.kind, material, count: 0, areaM2: 0 }
    row.count += 1
    row.areaM2 += areaM2
    rows.set(key, row)
  }
  const groups = AREA_GROUPS.map((group) => {
    const list = [...rows.values()]
      .filter((r) => r.group === group)
      .sort(
        (a, b) =>
          OBJECT_KINDS.indexOf(a.kind) - OBJECT_KINDS.indexOf(b.kind) ||
          (a.material ? MATERIAL_IDS.indexOf(a.material) : -1) -
            (b.material ? MATERIAL_IDS.indexOf(b.material) : -1),
      )
      .map(({ group: _g, ...row }) => row)
    return { group, totalM2: list.reduce((s, r) => s + r.areaM2, 0), rows: list }
  }).filter((g) => g.rows.length > 0)
  return { plotM2: within ? polygonArea(within) : null, groups }
}

export type PlanLabel = { id: string; at: Point; lines: string[] }

/**
 * Text blocks for the plan: an object's name (labels layer) and its area (measurements layer,
 * surface and bed bands only), for objects on visible layers.
 */
export function planLabels(
  project: Project,
  show: { names: boolean; areas: boolean },
  lang?: string,
): PlanLabel[] {
  const labels: PlanLabel[] = []
  for (const object of project.objects) {
    if (object.kind === 'dimension' || !isLayerVisible(project, object.layer)) continue
    const lines: string[] = []
    if (show.names && object.label) lines.push(object.label)
    const band = objectBand(object)
    if (show.areas && (band === 'surface' || band === 'bed')) {
      const area = objectArea(project, object)
      if (area !== null) lines.push(formatArea(area, 2, lang))
    }
    if (lines.length === 0) continue
    const shape = object.shape
    const at =
      shape.type === 'polygon'
        ? labelPoint(shape.points)
        : shape.type === 'point'
          ? shape.position
          : labelPoint(shape.points)
    labels.push({ id: object.id, at, lines })
  }
  return labels
}
