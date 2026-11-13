import {
  ArrowLeft,
  Hand,
  Keyboard,
  MousePointer2,
  PenTool,
  RectangleHorizontal,
  Redo2,
  Scan,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { zoomPercent } from '../../geometry/viewport'
import { normaliseName } from '../../model/defaults'
import { PROJECT_NAME_MAX_LENGTH, type Project } from '../../model/schema'
import { hrefFor } from '../../routing'
import { useProjectStore } from '../../store/projectStore'
import { useUiStore } from '../../store/uiStore'
import controls from '../../styles/controls.module.css'
import { cx } from '../../styles/cx'
import { editorActions } from './actions'
import styles from './EditorPage.module.css'
import { type ShortcutId, shortcutLabel } from './shortcuts'

type ToolButtonProps = {
  label: string
  shortcut?: ShortcutId
  pressed?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}

function ToolButton({ label, shortcut, pressed, disabled, onClick, children }: ToolButtonProps) {
  const hint = shortcut ? `${label} (${shortcutLabel(shortcut)})` : label
  return (
    <button
      type="button"
      className={styles.toolButton}
      aria-label={label}
      title={hint}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export function EditorToolbar({ project }: { project: Project }) {
  const { t } = useTranslation()
  const canUndo = useProjectStore((s) => s.past.length > 0)
  const canRedo = useProjectStore((s) => s.future.length > 0)
  const saveState = useProjectStore((s) => s.saveState)
  const update = useProjectStore((s) => s.update)
  const tool = useUiStore((s) => s.tool)
  const scale = useUiStore((s) => s.viewport.scale)
  const icon = { size: 18, 'aria-hidden': true } as const

  return (
    <header className={styles.toolbar}>
      <a className={styles.backLink} href={hrefFor({ name: 'projects' })} title={t('editor.back')}>
        <ArrowLeft {...icon} />
        <span className={controls.visuallyHidden}>{t('editor.back')}</span>
      </a>
      <h1 className={controls.visuallyHidden}>{project.name}</h1>
      <ProjectNameField
        key={project.id}
        name={project.name}
        onChange={(name) => update((p) => ({ ...p, name }), { coalesce: 'rename' })}
      />

      <div className={styles.toolGroups} role="toolbar" aria-label={t('editor.toolbar.label')}>
        <div className={styles.toolGroup}>
          <ToolButton
            label={t('editor.toolbar.undo')}
            shortcut="undo"
            disabled={!canUndo}
            onClick={editorActions.undo}
          >
            <Undo2 {...icon} />
          </ToolButton>
          <ToolButton
            label={t('editor.toolbar.redo')}
            shortcut="redo"
            disabled={!canRedo}
            onClick={editorActions.redo}
          >
            <Redo2 {...icon} />
          </ToolButton>
        </div>
        <div className={styles.toolGroup}>
          <ToolButton
            label={t('editor.toolbar.select')}
            shortcut="toolSelect"
            pressed={tool === 'select'}
            onClick={() => editorActions.setTool('select')}
          >
            <MousePointer2 {...icon} />
          </ToolButton>
          <ToolButton
            label={t('editor.toolbar.pan')}
            shortcut="toolPan"
            pressed={tool === 'pan'}
            onClick={() => editorActions.setTool('pan')}
          >
            <Hand {...icon} />
          </ToolButton>
        </div>
        <div className={styles.toolGroup}>
          <ToolButton
            label={t('editor.toolbar.drawPlot')}
            shortcut="drawPlot"
            pressed={tool === 'draw-plot'}
            onClick={() => editorActions.setTool('draw-plot')}
          >
            <PenTool {...icon} />
          </ToolButton>
          <ToolButton
            label={t('editor.toolbar.rectanglePlot')}
            shortcut="rectanglePlot"
            onClick={() => useUiStore.getState().setRectangleDialogOpen(true)}
          >
            <RectangleHorizontal {...icon} />
          </ToolButton>
        </div>
        <div className={styles.toolGroup}>
          <ToolButton
            label={t('editor.toolbar.zoomOut')}
            shortcut="zoomOut"
            onClick={editorActions.zoomOut}
          >
            <ZoomOut {...icon} />
          </ToolButton>
          <span className={styles.zoomLevel} data-testid="zoom-level">
            {t('editor.toolbar.zoomLevel', { percent: zoomPercent(scale) })}
          </span>
          <ToolButton
            label={t('editor.toolbar.zoomIn')}
            shortcut="zoomIn"
            onClick={editorActions.zoomIn}
          >
            <ZoomIn {...icon} />
          </ToolButton>
          <ToolButton
            label={t('editor.toolbar.zoomFit')}
            shortcut="zoomFit"
            onClick={editorActions.zoomToFit}
          >
            <Scan {...icon} />
          </ToolButton>
        </div>
        <div className={styles.toolGroup}>
          <ToolButton
            label={t('editor.toolbar.help')}
            shortcut="help"
            onClick={() => useUiStore.getState().setHelpOpen(true)}
          >
            <Keyboard {...icon} />
          </ToolButton>
        </div>
      </div>

      <span
        className={cx(styles.saveState, saveState === 'error' && styles.saveError)}
        role="status"
        data-state={saveState}
      >
        {t(`editor.saveState.${saveState}`)}
      </span>
    </header>
  )
}

function ProjectNameField({ name, onChange }: { name: string; onChange: (name: string) => void }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(name)
  const input = useRef<HTMLInputElement>(null)

  // Follow outside changes (undo/redo) unless the user is typing in the field.
  useEffect(() => {
    if (document.activeElement !== input.current) setDraft(name)
  }, [name])

  return (
    <input
      ref={input}
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
