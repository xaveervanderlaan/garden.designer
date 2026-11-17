import { X } from 'lucide-react'
import { type ReactNode, useEffect, useId } from 'react'
import { useTranslation } from 'react-i18next'
import styles from './viewer.module.css'

type Props = { title: string; onClose(): void; children?: ReactNode }

/** A non-modal panel over the bottom of the plan; Escape or the X closes it. */
export function BottomSheet({ title, onClose, children }: Props) {
  const { t } = useTranslation()
  const titleId = useId()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <section className={styles.sheet} role="dialog" aria-labelledby={titleId}>
      <header className={styles.sheetHeader}>
        <h2 id={titleId} className={styles.sheetTitle}>
          {title}
        </h2>
        <button
          type="button"
          className={styles.iconButton}
          aria-label={t('viewer.sheet.close')}
          title={t('viewer.sheet.close')}
          onClick={onClose}
        >
          <X size={20} aria-hidden="true" />
        </button>
      </header>
      {children && <div className={styles.sheetBody}>{children}</div>}
    </section>
  )
}
