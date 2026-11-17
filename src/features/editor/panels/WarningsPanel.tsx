import { TriangleAlert } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { formatPercent } from '../../../i18n/units'
import { validSelection } from '../../../model/edit'
import type { Project } from '../../../model/schema'
import { useSunMapStore } from '../../../store/sunMapStore'
import { designWarnings, groupWarnings } from '../../../model/warnings'
import { useUiStore } from '../../../store/uiStore'
import { usePlantView } from '../view/plantView'
import { CollapsibleSection } from './CollapsibleSection'
import { useWarningGroupText } from './warningText'
import styles from './panels.module.css'

/**
 * Every planting warning, one line per kind and species; a click selects the plants. Overlaps are
 * for the year shown in the view bar.
 */
export function WarningsPanel({ project }: { project: Project }) {
  const { t } = useTranslation()
  const { year } = usePlantView(project)
  const sunMap = useSunMapStore((s) => s.result)
  const warnings = designWarnings(project, year, sunMap)
  const groups = useMemo(() => groupWarnings(project, warnings), [project, warnings])
  const text = useWarningGroupText(project)

  function select(ids: string[]) {
    const ui = useUiStore.getState()
    ui.setTool('select')
    ui.setSelection(validSelection(project, ids))
  }

  return (
    <CollapsibleSection title={t('editor.warnings.title')} badge={warnings.length || null}>
      {groups.length === 0 ? (
        <p className={styles.hint} data-testid="no-warnings">
          {t('editor.warnings.none')}
        </p>
      ) : (
        <ul className={styles.rowList} aria-label={t('editor.warnings.title')}>
          {groups.map((group) => (
            <li key={group.key}>
              <button
                type="button"
                className={styles.rowButton}
                title={t('editor.warnings.selectHint')}
                onClick={() => select(group.plantingIds)}
              >
                <TriangleAlert
                  size={15}
                  aria-hidden
                  className={group.suitability === 'dry' ? styles.noticeIcon : styles.warningIcon}
                />
                <span className={styles.rowText}>{text(group)}</span>
                {group.count > 1 && (
                  <span className={styles.countBadge}>
                    {t('editor.warnings.count', { count: group.count })}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className={styles.smallHint}>
        {year === 'mature'
          ? t('editor.warnings.thresholdHint', {
              percent: formatPercent(project.settings.overlapThreshold),
            })
          : t('editor.warnings.thresholdHintYear', {
              percent: formatPercent(project.settings.overlapThreshold),
              year,
            })}
      </p>
    </CollapsibleSection>
  )
}
