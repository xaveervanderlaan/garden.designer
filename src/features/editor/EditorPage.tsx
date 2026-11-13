import { useTranslation } from 'react-i18next'
import { hrefFor } from '../../routing'
import page from '../../styles/page.module.css'

type Props = { projectId: string }

/** Placeholder: the canvas editor arrives in M2. */
export function EditorPage({ projectId }: Props) {
  const { t } = useTranslation()

  return (
    <section className={page.page}>
      <h1 className={page.title}>{t('editor.title')}</h1>
      <div className={page.card}>
        <p className={page.muted}>{t('editor.placeholder', { id: projectId })}</p>
        <a className={page.link} href={hrefFor({ name: 'projects' })}>
          {t('editor.back')}
        </a>
      </div>
    </section>
  )
}
