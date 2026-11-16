import { useTranslation } from 'react-i18next'
import { edgeLengths } from '../../../geometry/polygon'
import { cornerLabel } from '../../../model/plot'
import type { Point } from '../../../model/schema'
import { NumberField } from './NumberField'
import styles from './panels.module.css'

/** Every edge of an outline (A → B, …) or of an open line, with its length, editable. */
export function EdgeList({
  outline,
  closed = true,
  onLengthChange,
}: {
  outline: readonly Point[]
  closed?: boolean
  onLengthChange: (index: number, length: number) => void
}) {
  const { t } = useTranslation()
  const n = outline.length
  return (
    <>
      <h3 className={styles.subtitle}>{t('editor.plot.edges')}</h3>
      <ul className={styles.edgeList}>
        {edgeLengths(outline, closed).map((length, i) => {
          const from = cornerLabel(i)
          const to = cornerLabel((i + 1) % n)
          return (
            <li key={i} className={styles.edgeRow}>
              <span className={styles.edgeName}>{t('editor.plot.edge', { from, to })}</span>
              <NumberField
                value={length}
                label={t('editor.plot.edgeLength', { from, to })}
                accept={(value) => value > 0}
                onCommit={(value) => onLengthChange(i, value)}
              />
              <span aria-hidden>{t('editor.drawing.metres')}</span>
            </li>
          )
        })}
      </ul>
    </>
  )
}
