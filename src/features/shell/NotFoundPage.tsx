import { useTranslation } from 'react-i18next'
import { hrefFor } from '../../routing'
import page from '../../styles/page.module.css'

export function NotFoundPage() {
  const { t } = useTranslation()

  return (
    <section className={page.page}>
      <h1 className={page.title}>{t('notFound.title')}</h1>
      <p className={page.muted}>{t('notFound.text')}</p>
      <a className={page.link} href={hrefFor({ name: 'projects' })}>
        {t('notFound.back')}
      </a>
    </section>
  )
}
