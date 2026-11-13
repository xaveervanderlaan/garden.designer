import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { normaliseName } from '../../model/defaults'
import { PROJECT_NAME_MAX_LENGTH } from '../../model/schema'
import controls from '../../styles/controls.module.css'
import { cx } from '../../styles/cx'
import styles from './ProjectsPage.module.css'

type Props = {
  onCreate: (name: string) => Promise<void>
  onCancel: () => void
}

export function NewProjectForm({ onCreate, onCancel }: Props) {
  const { t } = useTranslation()
  const [name, setName] = useState(() => t('projects.newForm.defaultName'))
  const [showError, setShowError] = useState(false)
  const [busy, setBusy] = useState(false)
  const inputId = useId()
  const errorId = useId()

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!normaliseName(name)) {
      setShowError(true)
      return
    }
    setBusy(true)
    try {
      await onCreate(name)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className={styles.panel}
      onSubmit={(e) => void submit(e)}
      onKeyDown={(e) => e.key === 'Escape' && onCancel()}
    >
      <label htmlFor={inputId} className={controls.label}>
        {t('projects.newForm.label')}
      </label>
      <div className={styles.inlineForm}>
        <input
          id={inputId}
          className={cx(controls.input, styles.nameInput)}
          value={name}
          maxLength={PROJECT_NAME_MAX_LENGTH}
          autoFocus
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            setName(e.target.value)
            setShowError(false)
          }}
          aria-invalid={showError}
          aria-describedby={showError ? errorId : undefined}
        />
        <button type="submit" className={cx(controls.button, controls.primary)} disabled={busy}>
          {t('projects.newForm.create')}
        </button>
        <button type="button" className={cx(controls.button, controls.quiet)} onClick={onCancel}>
          {t('common.cancel')}
        </button>
      </div>
      {showError && (
        <p id={errorId} className={controls.fieldError}>
          {t('projects.nameRequired')}
        </p>
      )}
    </form>
  )
}
