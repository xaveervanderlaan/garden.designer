import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  type ImportErrorCode,
  ImportError,
  exportProject,
  importGardenFile,
} from '../../persistence/gardenFile'
import {
  type ProjectSummary,
  createProject,
  deleteProject,
  duplicateProject,
  listProjects,
  renameProject,
} from '../../persistence/projects'
import { navigate } from '../../routing'
import controls from '../../styles/controls.module.css'
import { cx } from '../../styles/cx'
import page from '../../styles/page.module.css'
import { NewProjectForm } from './NewProjectForm'
import { ProjectListItem } from './ProjectListItem'
import { downloadTextFile } from './download'
import styles from './ProjectsPage.module.css'

type Message = { kind: 'notice' | 'error'; text: string }

const IMPORT_ERROR_KEYS = {
  notJson: 'projects.errors.importNotJson',
  notGardenFile: 'projects.errors.importNotGardenFile',
  newerVersion: 'projects.errors.importNewerVersion',
  invalid: 'projects.errors.importInvalid',
} as const satisfies Record<ImportErrorCode, string>

type ListResult = { projects: ProjectSummary[] } | { error: true }

export function ProjectsPage() {
  const { t } = useTranslation()
  const list = useLiveQuery(async (): Promise<ListResult> => {
    try {
      return { projects: await listProjects() }
    } catch (error) {
      console.error('Could not list projects', error)
      return { error: true }
    }
  }, [])
  const [showNewForm, setShowNewForm] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  /** Runs a list action and shows its notice (if any), or a generic error if it fails. */
  async function run(action: () => Promise<string | null>) {
    try {
      const text = await action()
      setMessage(text ? { kind: 'notice', text } : null)
    } catch (error) {
      console.error(error)
      setMessage({ kind: 'error', text: t('projects.errors.generic') })
    }
  }

  async function handleCreate(name: string) {
    try {
      const project = await createProject(name)
      navigate({ name: 'editor', projectId: project.id })
    } catch (error) {
      console.error(error)
      setMessage({ kind: 'error', text: t('projects.errors.generic') })
    }
  }

  async function handleImport(file: File) {
    try {
      const project = await importGardenFile(await file.text())
      setMessage({ kind: 'notice', text: t('projects.notices.imported', { name: project.name }) })
    } catch (error) {
      // Usually the user's file, not a bug: warn instead of logging an error.
      console.warn('Import failed', error)
      const key = error instanceof ImportError ? IMPORT_ERROR_KEYS[error.code] : null
      setMessage({ kind: 'error', text: t(key ?? 'projects.errors.generic') })
    }
  }

  return (
    <section className={page.page}>
      <div className={styles.titleRow}>
        <h1 className={page.title}>{t('projects.title')}</h1>
        <div className={styles.toolbar}>
          <button
            type="button"
            className={cx(controls.button, controls.primary)}
            disabled={showNewForm}
            onClick={() => {
              setShowNewForm(true)
              setMessage(null)
            }}
          >
            {t('projects.new')}
          </button>
          <button
            type="button"
            className={controls.button}
            onClick={() => fileInput.current?.click()}
          >
            {t('projects.import')}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            className={controls.visuallyHidden}
            tabIndex={-1}
            aria-hidden="true"
            data-testid="import-input"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = '' // allow importing the same file again
              if (file) void handleImport(file)
            }}
          />
        </div>
      </div>

      {message && (
        <div
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={message.kind === 'error' ? controls.error : controls.notice}
        >
          <span>{message.text}</span>
          <button
            type="button"
            className={cx(controls.button, controls.quiet, controls.small)}
            onClick={() => setMessage(null)}
          >
            {t('common.dismiss')}
          </button>
        </div>
      )}

      {showNewForm && (
        <NewProjectForm onCreate={handleCreate} onCancel={() => setShowNewForm(false)} />
      )}

      {list === undefined ? (
        <p className={page.muted}>{t('projects.loading')}</p>
      ) : 'error' in list ? (
        <div className={controls.error} role="alert">
          {t('projects.storageError')}
        </div>
      ) : list.projects.length === 0 ? (
        !showNewForm && (
          <div className={page.card}>
            <p>{t('projects.empty')}</p>
            <p className={page.muted}>{t('projects.emptyHint')}</p>
          </div>
        )
      ) : (
        <ul className={styles.list} aria-label={t('projects.listLabel')}>
          {list.projects.map((project) => (
            <ProjectListItem
              key={project.id}
              project={project}
              onRename={(name) =>
                run(async () => {
                  await renameProject(project.id, name)
                  return null
                })
              }
              onDuplicate={() =>
                run(async () => {
                  const copy = await duplicateProject(
                    project.id,
                    t('projects.copyName', { name: project.name }),
                  )
                  return t('projects.notices.duplicated', { name: copy.name })
                })
              }
              onExport={() =>
                run(async () => {
                  const { fileName, json } = await exportProject(project.id)
                  downloadTextFile(fileName, json)
                  return t('projects.notices.exported', { name: project.name, file: fileName })
                })
              }
              onDelete={() =>
                run(async () => {
                  await deleteProject(project.id)
                  return t('projects.notices.deleted', { name: project.name })
                })
              }
            />
          ))}
        </ul>
      )}
    </section>
  )
}
