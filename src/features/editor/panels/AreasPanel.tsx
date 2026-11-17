import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { currentLanguage } from '../../../i18n'
import { formatArea } from '../../../i18n/units'
import { areaTotals } from '../../../model/areas'
import type { Project } from '../../../model/schema'
import { CollapsibleSection } from './CollapsibleSection'
import styles from './panels.module.css'

/** Area totals per surface type, bed and building group, counted inside the plot. */
export function AreasPanel({ project }: { project: Project }) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const totals = useMemo(() => areaTotals(project), [project])
  return (
    <CollapsibleSection title={t('editor.areas.title')} defaultOpen={false}>
      <div data-testid="area-totals">
        {totals.plotM2 !== null && (
          <p className={styles.listGroupTitle}>
            {t('editor.areas.plot')}:{' '}
            <span data-testid="area-plot">{formatArea(totals.plotM2, 1, lang)}</span>
          </p>
        )}
        {totals.groups.length === 0 ? (
          <p className={styles.hint}>{t('editor.areas.empty')}</p>
        ) : (
          totals.groups.map(({ group, totalM2, rows }) => (
            <div key={group} className={styles.listGroup} data-testid={`area-group-${group}`}>
              <p className={styles.listGroupTitle}>
                {t(`editor.areas.groups.${group}`)}: {formatArea(totalM2, 1, lang)}
              </p>
              <ul className={styles.rowList}>
                {rows.map((row) => (
                  <li key={`${row.kind}|${row.material ?? ''}`} className={styles.rowText}>
                    {t(`editor.objectKinds.${row.kind}`)}
                    {row.material ? ` (${t(`editor.materials.${row.material}`)})` : ''}
                    {row.count > 1 ? ` ×${row.count}` : ''}: {formatArea(row.areaM2, 1, lang)}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
        <p className={styles.hint}>{t('editor.areas.insidePlot')}</p>
      </div>
    </CollapsibleSection>
  )
}
