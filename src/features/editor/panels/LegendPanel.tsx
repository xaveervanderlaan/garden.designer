import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { legendEntries } from '../../../model/legend'
import type { Project } from '../../../model/schema'
import { LegendSwatch } from './legendItems'
import { legendKey, legendName } from './legendText'
import { CollapsibleSection } from './CollapsibleSection'
import styles from './panels.module.css'

/** The element styles in use in the design, with what each stands for. */
export function LegendPanel({ project }: { project: Project }) {
  const { t } = useTranslation()
  const entries = useMemo(() => legendEntries(project), [project])
  return (
    <CollapsibleSection title={t('editor.legend.title')} defaultOpen={false}>
      {entries.length === 0 ? (
        <p className={styles.hint}>{t('editor.legend.empty')}</p>
      ) : (
        <ul className={styles.rowList} data-testid="legend">
          {entries.map((entry) => (
            <li key={legendKey(entry)} className={styles.rowText} data-testid="legend-entry">
              <LegendSwatch project={project} entry={entry} /> {legendName(t, entry)}
            </li>
          ))}
        </ul>
      )}
    </CollapsibleSection>
  )
}
