import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Project } from '../../model/schema'
import { exportProjectFile } from '../../persistence/gardenFile'
import { useProjectStore } from '../../store/projectStore'
import controls from '../../styles/controls.module.css'
import { cx } from '../../styles/cx'
import { downloadTextFile } from '../projects/download'
import styles from './StorageErrorBanner.module.css'

/**
 * Shown above the plan while the latest changes couldn't be saved. The changes stay in memory and
 * saving is retried with the next change; meanwhile the design can be exported as it is now.
 */
export function StorageErrorBanner({ project }: { project: Project }) {
  const { t } = useTranslation()
  const saveState = useProjectStore((s) => s.saveState)
  const saveError = useProjectStore((s) => s.saveError)
  const [exportFailed, setExportFailed] = useState(false)

  if (saveState !== 'error') return null

  async function exportBackup() {
    try {
      const { fileName, json } = await exportProjectFile(project)
      downloadTextFile(fileName, json)
      setExportFailed(false)
    } catch (error) {
      console.error('Backup export failed', error)
      setExportFailed(true)
    }
  }

  return (
    <div className={styles.banner} role="alert" data-testid="storage-error">
      <div className={styles.text}>
        <p>{t(saveError === 'full' ? 'storage.autosaveFull' : 'storage.autosaveFailed')}</p>
        {exportFailed && <p className={styles.exportFailed}>{t('storage.exportFailed')}</p>}
      </div>
      <button
        type="button"
        className={cx(controls.button, controls.small, styles.button)}
        onClick={() => void exportBackup()}
      >
        {t('storage.exportBackup')}
      </button>
    </div>
  )
}
