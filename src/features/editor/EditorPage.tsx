import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { normaliseName } from '../../model/defaults'
import { PROJECT_NAME_MAX_LENGTH } from '../../model/schema'
import { hrefFor } from '../../routing'
import { useProjectStore } from '../../store/projectStore'
import controls from '../../styles/controls.module.css'
import { cx } from '../../styles/cx'
import page from '../../styles/page.module.css'
import styles from './EditorPage.module.css'

type Props = { projectId: string }

export function EditorPage({ projectId }: Props) {
  const { t } = useTranslation()
  const project = useProjectStore((s) => s.project)
  const loadState = useProjectStore((s) => s.loadState)
  const saveState = useProjectStore((s) => s.saveState)
  const update = useProjectStore((s) => s.update)

  useEffect(() => {
    const { open, close } = useProjectStore.getState()
    void open(projectId)
    return () => void close()
  }, [projectId])

  // Write pending changes before the tab is hidden or closed.
  useEffect(() => {
    const flush = () => void useProjectStore.getState().flush()
    const onVisibility = () => document.visibilityState === 'hidden' && flush()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flush)
    }
  }, [])

  const backLink = (
    <a className={page.link} href={hrefFor({ name: 'projects' })}>
      {t('editor.back')}
    </a>
  )

  if (loadState !== 'ready' || !project) {
    const text =
      loadState === 'notFound'
        ? t('editor.notFound')
        : loadState === 'error'
          ? t('editor.loadError')
          : t('editor.loading')
    return (
      <section className={page.page}>
        <p className={loadState === 'error' ? controls.error : page.muted}>{text}</p>
        {(loadState === 'notFound' || loadState === 'error') && backLink}
      </section>
    )
  }

  return (
    <section className={page.page}>
      <div className={styles.topBar}>{backLink}</div>
      <div className={styles.header}>
        <h1 className={controls.visuallyHidden}>{project.name}</h1>
        <ProjectNameField
          key={project.id}
          name={project.name}
          onChange={(name) => update((p) => ({ ...p, name }))}
        />
        <span
          className={cx(styles.saveState, saveState === 'error' && styles.saveError)}
          role="status"
          data-state={saveState}
        >
          {t(`editor.saveState.${saveState}`)}
        </span>
      </div>
      <div className={page.card}>
        <p className={page.muted}>{t('editor.canvasComingSoon')}</p>
      </div>
    </section>
  )
}

function ProjectNameField({ name, onChange }: { name: string; onChange: (name: string) => void }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(name)

  return (
    <input
      className={cx(controls.input, styles.nameInput)}
      aria-label={t('editor.nameLabel')}
      value={draft}
      maxLength={PROJECT_NAME_MAX_LENGTH}
      onChange={(e) => {
        setDraft(e.target.value)
        const clean = normaliseName(e.target.value)
        if (clean && clean !== name) onChange(clean)
      }}
      // Show the cleaned-up name again; an emptied field falls back to the last valid name.
      onBlur={() => setDraft(name)}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  )
}
