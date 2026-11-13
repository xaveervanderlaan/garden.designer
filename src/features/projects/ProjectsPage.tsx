import { useTranslation } from 'react-i18next'
import { hrefFor } from '../../routing'
import page from '../../styles/page.module.css'

/** Placeholder: the real project list (create, open, rename, duplicate, delete) arrives in M1. */
export function ProjectsPage() {
  const { t } = useTranslation()

  return (
    <section className={page.page}>
      <h1 className={page.title}>{t('projects.title')}</h1>
      <div className={page.card}>
        <p>{t('projects.empty')}</p>
        <p className={page.muted}>{t('projects.comingSoon')}</p>
        <a className={page.link} href={hrefFor({ name: 'editor', projectId: 'demo' })}>
          {t('projects.previewEditor')}
        </a>
      </div>
    </section>
  )
}
