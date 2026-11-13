import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDateTime } from '../../i18n/format'
import { normaliseName } from '../../model/defaults'
import { PROJECT_NAME_MAX_LENGTH } from '../../model/schema'
import type { ProjectSummary } from '../../persistence/projects'
import { hrefFor } from '../../routing'
import controls from '../../styles/controls.module.css'
import { cx } from '../../styles/cx'
import styles from './ProjectsPage.module.css'

type Props = {
  project: ProjectSummary
  onRename: (name: string) => Promise<void>
  onDuplicate: () => Promise<void>
  onExport: () => Promise<void>
  onDelete: () => Promise<void>
}

type Mode = 'view' | 'rename' | 'confirmDelete'

export function ProjectListItem({ project, onRename, onDuplicate, onExport, onDelete }: Props) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<Mode>('view')
  const [draftName, setDraftName] = useState(project.name)
  const [showNameError, setShowNameError] = useState(false)
  const [busy, setBusy] = useState(false)

  async function act(action: () => Promise<void>, nextMode: Mode = 'view') {
    setBusy(true)
    try {
      await action()
      setMode(nextMode)
    } finally {
      setBusy(false)
    }
  }

  function startRename() {
    setDraftName(project.name)
    setShowNameError(false)
    setMode('rename')
  }

  async function submitRename(event: React.FormEvent) {
    event.preventDefault()
    const name = normaliseName(draftName)
    if (!name) {
      setShowNameError(true)
      return
    }
    if (name === project.name) {
      setMode('view')
      return
    }
    await act(() => onRename(name))
  }

  if (mode === 'rename') {
    return (
      <li className={styles.item}>
        <form
          className={styles.inlineForm}
          onSubmit={(e) => void submitRename(e)}
          onKeyDown={(e) => e.key === 'Escape' && setMode('view')}
        >
          <input
            className={cx(controls.input, styles.nameInput)}
            aria-label={t('projects.renameLabel', { name: project.name })}
            value={draftName}
            maxLength={PROJECT_NAME_MAX_LENGTH}
            autoFocus
            onFocus={(e) => e.target.select()}
            onChange={(e) => {
              setDraftName(e.target.value)
              setShowNameError(false)
            }}
            aria-invalid={showNameError}
          />
          <button type="submit" className={cx(controls.button, controls.primary)} disabled={busy}>
            {t('common.save')}
          </button>
          <button
            type="button"
            className={cx(controls.button, controls.quiet)}
            onClick={() => setMode('view')}
          >
            {t('common.cancel')}
          </button>
        </form>
        {showNameError && <p className={controls.fieldError}>{t('projects.nameRequired')}</p>}
      </li>
    )
  }

  if (mode === 'confirmDelete') {
    return (
      <li className={cx(styles.item, styles.itemDanger)}>
        <p className={styles.confirmText}>{t('projects.deleteConfirm', { name: project.name })}</p>
        <div className={styles.actions}>
          <button
            type="button"
            className={cx(controls.button, controls.danger)}
            disabled={busy}
            onClick={() => void act(onDelete)}
          >
            {t('projects.actions.delete')}
          </button>
          <button
            type="button"
            className={cx(controls.button, controls.quiet)}
            autoFocus
            onClick={() => setMode('view')}
          >
            {t('common.cancel')}
          </button>
        </div>
      </li>
    )
  }

  const small = cx(controls.button, controls.quiet, controls.small)
  return (
    <li className={styles.item}>
      <div className={styles.summary}>
        <a className={styles.name} href={hrefFor({ name: 'editor', projectId: project.id })}>
          {project.name}
        </a>
        <span className={styles.meta}>
          {t('projects.changed', { date: formatDateTime(project.updatedAt) })}
        </span>
      </div>
      <div className={styles.actions} role="group" aria-label={project.name}>
        <button type="button" className={small} onClick={startRename}>
          {t('projects.actions.rename')}
        </button>
        <button
          type="button"
          className={small}
          disabled={busy}
          onClick={() => void act(onDuplicate)}
        >
          {t('projects.actions.duplicate')}
        </button>
        <button type="button" className={small} disabled={busy} onClick={() => void act(onExport)}>
          {t('projects.actions.export')}
        </button>
        <button
          type="button"
          className={cx(small, styles.deleteButton)}
          onClick={() => setMode('confirmDelete')}
        >
          {t('projects.actions.delete')}
        </button>
      </div>
    </li>
  )
}
