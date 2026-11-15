import { useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import controls from '../styles/controls.module.css'
import { cx } from '../styles/cx'
import type { Updater } from './serviceWorker'
import styles from './UpdatePrompt.module.css'

/** A small notice when a new version of the app is waiting: reload now, or later. */
export function UpdatePrompt({ updater }: { updater: Updater }) {
  const { t } = useTranslation()
  const available = useSyncExternalStore(updater.subscribe, updater.getSnapshot)
  const [dismissed, setDismissed] = useState(false)
  const [reloading, setReloading] = useState(false)

  if (!available || dismissed) return null
  return (
    <div role="status" className={styles.prompt}>
      <span>{t('appUpdate.available')}</span>
      <div className={styles.actions}>
        <button
          type="button"
          className={cx(controls.button, controls.primary, controls.small)}
          disabled={reloading}
          onClick={() => {
            setReloading(true)
            void updater.applyUpdate()
          }}
        >
          {t('appUpdate.reload')}
        </button>
        <button
          type="button"
          className={cx(controls.button, controls.quiet, controls.small)}
          onClick={() => setDismissed(true)}
        >
          {t('appUpdate.later')}
        </button>
      </div>
    </div>
  )
}
