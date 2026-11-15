import type { TFunction } from 'i18next'
import type { Language } from '../../../i18n'
import { plantName } from '../../../model/plants'
import type { PlantingListGroup, PlantingListRow } from '../../../model/plantingList'

/** The planting list as plain text, e.g. to paste into a message or a shopping list. */
export function plantingListText({
  title,
  rows,
  groups,
  groupName,
  t,
  lang,
}: {
  title: string
  /** The list for the whole design. */
  rows: readonly PlantingListRow[]
  /** The list per bed; when given, the text is grouped by bed. */
  groups?: readonly PlantingListGroup[]
  groupName: (group: PlantingListGroup) => string
  t: TFunction
  lang: Language
}): string {
  const line = (row: PlantingListRow) => {
    const name = row.plant ? plantName(row.plant, lang) : t('editor.properties.unknownPlant')
    const latin = row.plant?.names.latin
    return latin && latin !== name
      ? t('editor.plantingList.textLine', { code: row.code, name, latin, count: row.count })
      : t('editor.plantingList.textLineShort', { code: row.code, name, count: row.count })
  }
  const total = rows.reduce((sum, row) => sum + row.count, 0)
  const lines = [t('editor.plantingList.textTitle', { name: title }), '']
  if (groups) {
    for (const group of groups) {
      lines.push(groupName(group), ...group.rows.map((row) => `  ${line(row)}`), '')
    }
  } else {
    lines.push(...rows.map(line), '')
  }
  lines.push(t('editor.plantingList.total', { count: total }))
  return lines.join('\n')
}
