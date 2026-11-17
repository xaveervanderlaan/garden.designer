import { DRAW_BANDS, MATERIAL_IDS, OBJECT_PRESETS, materialOf, symbolFor } from './objectKinds'
import type { MaterialId, SymbolVariantId } from './objectKinds'
import { isLayerVisible } from './edit'
import { findPlant, plantingLayer } from './plants'
import {
  OBJECT_KINDS,
  PLANT_CATEGORIES,
  type ObjectKind,
  type PlantCategory,
  type Project,
} from './schema'

export type LegendEntry =
  | { type: 'plot' }
  | { type: 'object'; kind: ObjectKind; material?: MaterialId; variant?: SymbolVariantId }
  | { type: 'plant'; category: PlantCategory; plantId: string }
  | { type: 'existing' }

/**
 * The element styles in use in the design, each once: the plot, objects (by draw band, kind,
 * material or variant), plants per category, and "existing" if anything is drawn as existing.
 * Only items on visible layers count.
 */
export function legendEntries(project: Project): LegendEntry[] {
  const entries: LegendEntry[] = []
  if (project.plot.outline.length >= 3 && isLayerVisible(project, 'existing')) {
    entries.push({ type: 'plot' })
  }
  let anyExisting = project.plot.outline.length >= 3 && isLayerVisible(project, 'existing')

  const objects = new Map<string, Extract<LegendEntry, { type: 'object' }>>()
  for (const object of project.objects) {
    if (!isLayerVisible(project, object.layer)) continue
    if (object.layer === 'existing') anyExisting = true
    const shape = object.shape.type
    const material = shape === 'polygon' ? materialOf(object) : null
    const variant = shape === 'point' ? symbolFor(object.kind, object.variant)?.id : undefined
    objects.set(`${object.kind}|${material ?? ''}|${variant ?? ''}`, {
      type: 'object',
      kind: object.kind,
      ...(material ? { material } : {}),
      ...(variant ? { variant } : {}),
    })
  }
  const sortKey = (e: Extract<LegendEntry, { type: 'object' }>) => [
    DRAW_BANDS.indexOf(OBJECT_PRESETS[e.kind].band),
    OBJECT_KINDS.indexOf(e.kind),
    e.material ? MATERIAL_IDS.indexOf(e.material) : -1,
    e.variant ?? '',
  ]
  entries.push(
    ...[...objects.values()].sort((a, b) => {
      const [ka, kb] = [sortKey(a), sortKey(b)]
      for (let i = 0; i < 3; i++) if (ka[i] !== kb[i]) return (ka[i] as number) - (kb[i] as number)
      return String(ka[3]).localeCompare(String(kb[3]))
    }),
  )

  const plants = new Map<PlantCategory, string>()
  for (const planting of project.plantings) {
    if (!isLayerVisible(project, plantingLayer(project, planting))) continue
    if (planting.status === 'existing') anyExisting = true
    const plant = findPlant(project, planting.plantId)
    if (plant && !plants.has(plant.category)) plants.set(plant.category, planting.plantId)
  }
  for (const category of PLANT_CATEGORIES) {
    const plantId = plants.get(category)
    if (plantId) entries.push({ type: 'plant', category, plantId })
  }
  if (anyExisting) entries.push({ type: 'existing' })
  return entries
}
