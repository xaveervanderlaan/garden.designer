import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { findPlant } from '../../../model/plants'
import { legendEntries } from '../../../model/legend'
import type { Project } from '../../../model/schema'
import { PLOT_STYLE } from '../../../styles/elementStyles'
import { PlantSymbol } from '../../library/parts'
import { ObjectSwatch } from '../objects/ObjectSwatch'
import { CollapsibleSection } from './CollapsibleSection'
import styles from './panels.module.css'

const ExistingSwatch = () => (
  <svg width={28} height={20} viewBox="0 0 28 20" aria-hidden>
    <rect
      x={2}
      y={3}
      width={24}
      height={14}
      fill="rgba(120,120,120,0.25)"
      stroke="#777"
      strokeWidth={1.25}
      strokeDasharray="3 2"
    />
  </svg>
)

const PlotSwatch = () => (
  <svg width={28} height={20} viewBox="0 0 28 20" aria-hidden>
    <rect
      x={2}
      y={3}
      width={24}
      height={14}
      fill={PLOT_STYLE.fill}
      stroke={PLOT_STYLE.stroke}
      strokeWidth={2}
    />
  </svg>
)

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
          {entries.map((entry) => {
            let key: string
            let swatch: React.ReactNode
            let name: string
            if (entry.type === 'plot') {
              key = 'plot'
              swatch = <PlotSwatch />
              name = t('editor.legend.plot')
            } else if (entry.type === 'existing') {
              key = 'existing'
              swatch = <ExistingSwatch />
              name = t('editor.legend.existing')
            } else if (entry.type === 'plant') {
              key = `plant|${entry.category}`
              const plant = findPlant(project, entry.plantId)
              swatch = plant ? <PlantSymbol plant={plant} size={20} /> : null
              name = t(`plants.categories.${entry.category}`)
            } else {
              key = `${entry.kind}|${entry.material ?? ''}|${entry.variant ?? ''}`
              swatch = (
                <ObjectSwatch kind={entry.kind} material={entry.material} variant={entry.variant} />
              )
              name = entry.variant
                ? t(`editor.symbolVariants.${entry.variant}`)
                : t(`editor.objectKinds.${entry.kind}`) +
                  (entry.material ? ` (${t(`editor.materials.${entry.material}`)})` : '')
            }
            return (
              <li key={key} className={styles.rowText} data-testid="legend-entry">
                {swatch} {name}
              </li>
            )
          })}
        </ul>
      )}
    </CollapsibleSection>
  )
}
