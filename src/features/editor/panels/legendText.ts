import type { TFunction } from 'i18next'
import type { LegendEntry } from '../../../model/legend'

/** A stable key for a legend entry. */
export function legendKey(entry: LegendEntry): string {
  if (entry.type === 'plot' || entry.type === 'existing') return entry.type
  if (entry.type === 'plant') return `plant|${entry.category}`
  return `${entry.kind}|${entry.material ?? ''}|${entry.variant ?? ''}`
}

/** What the entry stands for, in the current language. */
export function legendName(t: TFunction, entry: LegendEntry): string {
  if (entry.type === 'plot') return t('editor.legend.plot')
  if (entry.type === 'existing') return t('editor.legend.existing')
  if (entry.type === 'plant') return t(`plants.categories.${entry.category}`)
  return entry.variant
    ? t(`editor.symbolVariants.${entry.variant}`)
    : t(`editor.objectKinds.${entry.kind}`) +
        (entry.material ? ` (${t(`editor.materials.${entry.material}`)})` : '')
}
