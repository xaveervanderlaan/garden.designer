import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { gridSteps } from '../../../geometry/grid'
import { zoomPercent } from '../../../geometry/viewport'
import { formatLength, formatRoundLength } from '../../../i18n/units'
import { validSelection } from '../../../model/edit'
import type { Project } from '../../../model/schema'
import { useUiStore } from '../../../store/uiStore'
import styles from './panels.module.css'

export function StatusBar({ project }: { project: Project }) {
  const { t } = useTranslation()
  const cursor = useUiStore((s) => s.cursor)
  const scale = useUiStore((s) => s.viewport.scale)
  const selectionIds = useUiStore((s) => s.selection)
  const selected = useMemo(
    () => validSelection(project, selectionIds).length,
    [project, selectionIds],
  )

  return (
    <footer className={styles.statusBar}>
      <span data-testid="cursor-position" className={styles.statusPosition}>
        {cursor
          ? t('editor.status.position', { x: formatLength(cursor.x), y: formatLength(cursor.y) })
          : '–'}
      </span>
      <span>{t('editor.status.grid', { size: formatRoundLength(gridSteps(scale).minor) })}</span>
      <span>{t('editor.status.zoom', { percent: zoomPercent(scale) })}</span>
      <span data-testid="selection-count">
        {selected > 0 ? t('editor.status.selected', { count: selected }) : ''}
      </span>
    </footer>
  )
}
