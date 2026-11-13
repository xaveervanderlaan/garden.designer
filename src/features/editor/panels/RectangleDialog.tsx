import { X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { boundsOfPoints } from '../../../geometry/bounds'
import { formatNumber, parseNumber } from '../../../i18n/units'
import { useProjectStore } from '../../../store/projectStore'
import { useUiStore } from '../../../store/uiStore'
import controls from '../../../styles/controls.module.css'
import { cx } from '../../../styles/cx'
import { editorActions } from '../actions'
import styles from './panels.module.css'

const MAX_SIDE_M = 10_000
const DEFAULT_SIZE = { width: 20, depth: 15 }

/** Asks for width × depth and replaces the plot outline with that rectangle. */
export function RectangleDialog() {
  const open = useUiStore((s) => s.rectangleDialogOpen)
  if (!open) return null
  return <RectangleForm />
}

function RectangleForm() {
  const { t } = useTranslation()
  const outline = useProjectStore((s) => s.project?.plot.outline ?? [])
  const close = () => useUiStore.getState().setRectangleDialogOpen(false)
  const [initial] = useState(() => {
    const bounds = outline.length >= 3 ? boundsOfPoints(outline) : null
    return bounds
      ? { width: bounds.maxX - bounds.minX, depth: bounds.maxY - bounds.minY }
      : DEFAULT_SIZE
  })
  const [width, setWidth] = useState(() => formatNumber(initial.width, initial.width % 1 ? 2 : 0))
  const [depth, setDepth] = useState(() => formatNumber(initial.depth, initial.depth % 1 ? 2 : 0))
  const [showError, setShowError] = useState(false)
  const titleId = useId()
  const widthId = useId()
  const depthId = useId()
  const firstInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    firstInput.current?.select()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const valid = (value: number | undefined): value is number =>
    value !== undefined && value > 0 && value <= MAX_SIDE_M

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const w = parseNumber(width)
    const d = parseNumber(depth)
    if (!valid(w) || !valid(d)) {
      setShowError(true)
      return
    }
    close()
    editorActions.createRectanglePlot(w, d)
  }

  return (
    <div className={styles.backdrop} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <form
        className={cx(styles.dialog, styles.dialogNarrow)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={submit}
      >
        <div className={styles.dialogHeader}>
          <h2 id={titleId} className={styles.dialogTitle}>
            {t('editor.rectangle.title')}
          </h2>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={t('common.cancel')}
            onClick={close}
          >
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className={styles.fieldRow}>
          <div>
            <label className={controls.label} htmlFor={widthId}>
              {t('editor.rectangle.width')}
            </label>
            <input
              ref={firstInput}
              id={widthId}
              className={cx(controls.input, styles.field)}
              inputMode="decimal"
              value={width}
              aria-invalid={showError && !valid(parseNumber(width))}
              onChange={(e) => {
                setWidth(e.target.value)
                setShowError(false)
              }}
            />
          </div>
          <div>
            <label className={controls.label} htmlFor={depthId}>
              {t('editor.rectangle.depth')}
            </label>
            <input
              id={depthId}
              className={cx(controls.input, styles.field)}
              inputMode="decimal"
              value={depth}
              aria-invalid={showError && !valid(parseNumber(depth))}
              onChange={(e) => {
                setDepth(e.target.value)
                setShowError(false)
              }}
            />
          </div>
        </div>
        {showError && (
          <p className={controls.fieldError} role="alert">
            {t('editor.rectangle.invalid')}
          </p>
        )}
        <p className={styles.hint}>
          {outline.length >= 3 ? t('editor.rectangle.replaces') : t('editor.rectangle.note')}
        </p>
        <div className={styles.dialogActions}>
          <button type="button" className={cx(controls.button, controls.quiet)} onClick={close}>
            {t('common.cancel')}
          </button>
          <button type="submit" className={cx(controls.button, controls.primary)}>
            {t('editor.rectangle.create')}
          </button>
        </div>
      </form>
    </div>
  )
}
