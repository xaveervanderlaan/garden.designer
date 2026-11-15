import { useTranslation } from 'react-i18next'
import { type Bed, bedNumber } from '../../../model/beds'
import type { Project } from '../../../model/schema'

/** A bed's display name: its label, or e.g. "Ornamental bed 2". */
export function useBedName(project: Project): (bed: Bed) => string {
  const { t } = useTranslation()
  return (bed) =>
    bed.label?.trim() ||
    t(`editor.beds.defaultName.${bed.kind}`, { number: bedNumber(project, bed) })
}
