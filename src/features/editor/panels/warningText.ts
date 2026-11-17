import { useTranslation } from 'react-i18next'
import { currentLanguage } from '../../../i18n'
import { formatPercent } from '../../../i18n/units'
import type { GrowthView } from '../../../model/growth'
import { findPlant, plantName } from '../../../model/plants'
import type { Project } from '../../../model/schema'
import type { Warning, WarningGroup } from '../../../model/warnings'

/** Display name of a plant id (or "Unknown plant"). */
function useNameOf(project: Project): (plantId: string) => string {
  const { t } = useTranslation()
  const lang = currentLanguage()
  return (plantId) => {
    const plant = findPlant(project, plantId)
    return plant ? plantName(plant, lang) : t('editor.properties.unknownPlant')
  }
}

/**
 * A warning about one planting (`about`), as shown in its properties. `view` is the growth year the
 * warnings were computed for (overlaps depend on it).
 */
export function useWarningText(
  project: Project,
  view: GrowthView,
): (warning: Warning, about: string) => string {
  const { t } = useTranslation()
  const nameOf = useNameOf(project)
  const soil = t(`plants.soil.${project.settings.soil}`).toLowerCase()
  return (warning, about) => {
    switch (warning.kind) {
      case 'overlap': {
        const otherId = warning.plantingId === about ? warning.otherId : warning.plantingId
        const other = project.plantings.find((p) => p.id === otherId)
        const values = {
          name: other ? nameOf(other.plantId) : '',
          percent: formatPercent(warning.fraction),
        }
        return view === 'mature'
          ? t('editor.warnings.overlapOne', values)
          : t('editor.warnings.overlapOneYear', { ...values, year: view })
      }
      case 'overlap-object': {
        const object = project.objects.find((o) => o.id === warning.objectId)
        const values = {
          object: object ? t(`editor.objectKinds.${object.kind}`).toLowerCase() : '',
          percent: formatPercent(warning.fraction),
        }
        return view === 'mature'
          ? t('editor.warnings.overlapObjectOne', values)
          : t('editor.warnings.overlapObjectOneYear', { ...values, year: view })
      }
      case 'outside-plot':
        return t('editor.warnings.outsideOne')
      case 'soil':
        return warning.suitability === 'dry'
          ? t('editor.warnings.soilDryOne')
          : t('editor.warnings.soilUnsuitedOne', { soil })
      case 'sun': {
        const plant = project.plantings.find((p) => p.id === about)
        const needs = (plant ? (findPlant(project, plant.plantId)?.sun ?? []) : [])
          .map((level) => t(`plants.sun.${level}`).toLowerCase())
          .join(t('editor.warnings.or'))
        return t('editor.warnings.sunOne', {
          level: t(`plants.sun.${warning.level}`).toLowerCase(),
          needs,
        })
      }
    }
  }
}

/** A line in the warnings list: one kind of warning for one species (or a pair). */
export function useWarningGroupText(project: Project): (group: WarningGroup) => string {
  const { t } = useTranslation()
  const nameOf = useNameOf(project)
  const soil = t(`plants.soil.${project.settings.soil}`).toLowerCase()
  return (group) => {
    const [a = '', b] = group.plantIds
    switch (group.kind) {
      case 'overlap':
        return b === undefined
          ? t('editor.warnings.overlapSame', { name: nameOf(a) })
          : t('editor.warnings.overlapPair', { a: nameOf(a), b: nameOf(b) })
      case 'overlap-object':
        return t('editor.warnings.overlapObject', {
          name: nameOf(a),
          object: t(`editor.objectKinds.${group.objectKind ?? 'house'}`).toLowerCase(),
        })
      case 'outside-plot':
        return t('editor.warnings.outside', { name: nameOf(a) })
      case 'soil':
        return group.suitability === 'dry'
          ? t('editor.warnings.soilDry', { name: nameOf(a) })
          : t('editor.warnings.soilUnsuited', { name: nameOf(a), soil })
      case 'sun':
        return t('editor.warnings.sun', {
          name: nameOf(a),
          level: t(`plants.sun.${group.level ?? 'shade'}`).toLowerCase(),
        })
    }
  }
}
