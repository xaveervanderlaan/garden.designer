import type { Language } from '../../../i18n'
import { type PlanLabel, planLabels } from '../../../model/areas'
import { isLayerVisible } from '../../../model/edit'
import { plantingLabels } from '../../../model/plantings'
import type { Project } from '../../../model/schema'
import type { LabelMode } from '../../../store/uiStore'

/**
 * The labels the plan shows: plant labels (when the labels layer is visible) and names/areas of
 * objects (names with the labels layer, areas with the measurements layer and the area-labels
 * setting). Null when there are none to draw.
 */
export function itemLabels(
  project: Project,
  labelMode: LabelMode,
  lang: Language,
): { labels: ReadonlyMap<string, string> | null; planLabels: readonly PlanLabel[] | null } {
  const names = isLayerVisible(project, 'labels')
  const areas = isLayerVisible(project, 'measurements') && project.settings.areaLabels
  return {
    labels: names ? plantingLabels(project, labelMode, lang) : null,
    planLabels: names || areas ? planLabels(project, { names, areas }, lang) : null,
  }
}
