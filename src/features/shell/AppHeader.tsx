import { useTranslation } from 'react-i18next'
import { hrefFor } from '../../routing'
import { LanguageSwitch } from './LanguageSwitch'
import styles from './AppHeader.module.css'

export function AppHeader() {
  const { t } = useTranslation()

  return (
    <header className={styles.header}>
      <a className={styles.brand} href={hrefFor({ name: 'projects' })} title={t('app.home')}>
        <svg className={styles.logo} viewBox="0 0 32 32" aria-hidden="true">
          <rect width="32" height="32" rx="7" fill="currentColor" />
          <path d="M8 24C8 14 14 8 25 7c-1 11-7 17-17 17Z" fill="#a8d5a2" />
          <path d="M8 24 19 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <span>{t('app.name')}</span>
      </a>
      <LanguageSwitch />
    </header>
  )
}
