import { X } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { defaultBrief, setBrief } from '../../../model/brief'
import type { Brief, Project } from '../../../model/schema'
import { useProjectStore } from '../../../store/projectStore'
import { type IdeasTab, useUiStore } from '../../../store/uiStore'
import { cx } from '../../../styles/cx'
import panels from '../panels/panels.module.css'
import { AnswerStep } from './AnswerStep'
import { BriefForm } from './BriefForm'
import styles from './ideas.module.css'
import { PromptStep } from './PromptStep'

const TABS: readonly IdeasTab[] = ['brief', 'prompt', 'proposals']

/** The brief as saved, without the design area (that is drawn and saved on its own). */
function savedDraft(project: Project): Brief {
  const { area: _, ...brief } = project.brief ?? defaultBrief()
  return brief
}

/**
 * Design ideas (M19): fill in a brief, copy the prompt it makes into Claude, paste the answer back
 * and turn one of its proposals into a new design.
 */
export function DesignIdeasDialog() {
  const open = useUiStore((s) => s.ideasOpen)
  const hasProject = useProjectStore((s) => !!s.project)
  if (!open || !hasProject) return null
  return <IdeasDialog />
}

function IdeasDialog() {
  const { t } = useTranslation()
  const tab = useUiStore((s) => s.ideasTab)
  const project = useProjectStore((s) => s.project!)
  const [draft, setDraft] = useState<Brief>(() => savedDraft(project))
  const dirty = JSON.stringify(draft) !== JSON.stringify(savedDraft(project))
  const titleId = useId()
  const close = () => useUiStore.getState().setIdeasOpen(false)

  /** Saves the draft as one undo step (the design area stays as it is). */
  const save = () => {
    if (!dirty) return
    useProjectStore.getState().update((p) => {
      const area = p.brief?.area
      return setBrief(p, area ? { ...draft, area } : draft)
    })
  }
  const show = (next: IdeasTab) => {
    if (next !== 'brief') save()
    useUiStore.getState().setIdeasTab(next)
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // The proposal preview closes itself first and marks the key as handled.
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className={panels.backdrop} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div
        className={cx(panels.dialog, styles.dialog, tab === 'proposals' && styles.wide)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="design-ideas-dialog"
      >
        <div className={panels.dialogHeader}>
          <h2 id={titleId} className={panels.dialogTitle}>
            {t('proposals.title')}
          </h2>
          <button
            type="button"
            className={panels.iconButton}
            aria-label={t('proposals.close')}
            onClick={close}
          >
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className={styles.tabs} role="tablist">
          {TABS.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              className={styles.tab}
              aria-selected={tab === id}
              onClick={() => show(id)}
            >
              {t(`proposals.tabs.${id}`)}
            </button>
          ))}
        </div>
        <div role="tabpanel">
          {tab === 'brief' && (
            <BriefForm
              project={project}
              draft={draft}
              dirty={dirty}
              onChange={setDraft}
              onSave={save}
              onNext={() => show('prompt')}
            />
          )}
          {tab === 'prompt' && <PromptStep project={project} onNext={() => show('proposals')} />}
          {tab === 'proposals' && <AnswerStep project={project} />}
        </div>
      </div>
    </div>
  )
}
