import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import styles from './panels.module.css'

/** Placeholder: the plant library arrives in M5. */
export function LibraryPanel() {
  const { t } = useTranslation()
  const titleId = useId()
  return (
    <section className={styles.panel} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.title}>
        {t('editor.library.title')}
      </h2>
      <p className={styles.hint}>{t('editor.library.comingSoon')}</p>
    </section>
  )
}
