import { useTranslation } from 'react-i18next'
import { SUPPORTED_LANGUAGES, currentLanguage } from '../../i18n'
import styles from './LanguageSwitch.module.css'

export function LanguageSwitch() {
  const { t, i18n } = useTranslation()
  const active = currentLanguage()

  return (
    <div className={styles.switch} role="group" aria-label={t('language.label')}>
      {SUPPORTED_LANGUAGES.map((lng) => (
        <button
          key={lng}
          type="button"
          lang={lng}
          className={styles.option}
          aria-pressed={lng === active}
          title={t(`language.names.${lng}`)}
          onClick={() => void i18n.changeLanguage(lng)}
        >
          {lng.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
