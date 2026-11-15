import { useTranslation } from 'react-i18next'
import { currentLanguage } from '../../../i18n'
import { findPlant, plantName } from '../../../model/plants'
import type { Project } from '../../../model/schema'
import { useUiStore } from '../../../store/uiStore'
import controls from '../../../styles/controls.module.css'
import { cx } from '../../../styles/cx'
import { editorActions } from '../actions'
import styles from './GardenCanvas.module.css'

/** Stamp mode, below the plan: which plant each click places, and how to stop. */
export function StampPanel({ project }: { project: Project }) {
  const { t } = useTranslation()
  const stamp = useUiStore((s) => s.stamp)
  const plant = stamp ? findPlant(project, stamp.plantId) : undefined
  if (!stamp) return null
  const name = plant ? plantName(plant, currentLanguage()) : ''

  return (
    <div className={styles.placingPanel} data-testid="stamp-panel">
      <p className={styles.placingText} role="status">
        <span className={styles.drawingTitle}>{t('editor.placing.stampTitle', { name })}</span>
        {t('editor.placing.stampHint')}
      </p>
      <div className={styles.placingControls}>
        <span className={styles.drawingMeasured} data-testid="stamp-count">
          {t('editor.placing.placed', { count: stamp.placed })}
        </span>
        <button
          type="button"
          className={cx(controls.button, controls.primary, controls.small)}
          onClick={editorActions.stopPlacing}
        >
          {t('editor.placing.done')}
        </button>
      </div>
    </div>
  )
}
