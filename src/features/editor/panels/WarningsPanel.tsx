import { TriangleAlert } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { formatPercent } from '../../../i18n/units'
import { validSelection } from '../../../model/edit'
import type { Project } from '../../../model/schema'
import { designWarnings, groupWarnings } from '../../../model/warnings'
import { useUiStore } from '../../../store/uiStore'
import { CollapsibleSection } from './CollapsibleSection'
import { useWarningGroupText } from './warningText'
import styles from './panels.module.css'

/** Every planting warning, one line per kind and species; a click selects the plants. */
export function WarningsPanel({ project }: { project: Project }) {
  const { t } = useTranslation()
  const warnings = designWarnings(project)
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
        {t('editor.warnings.thresholdHint', {
          percent: formatPercent(project.settings.overlapThreshold),
        })}
      </p>
    </CollapsibleSection>
  )
}
