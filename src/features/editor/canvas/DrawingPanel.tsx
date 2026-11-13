import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { parseNumber } from '../../../i18n/units'
import { MIN_PLOT_CORNERS } from '../../../model/plot'
import type { Point } from '../../../model/schema'
import { useUiStore } from '../../../store/uiStore'
import controls from '../../../styles/controls.module.css'
import { cx } from '../../../styles/cx'
import { editorActions } from '../actions'
import { isTypingTarget } from '../shortcuts'
import styles from './GardenCanvas.module.css'

type ErrorKey =
  | 'editor.drawing.invalidLength'
  | 'editor.drawing.invalidAngle'
  | 'editor.drawing.needStart'
  | 'editor.drawing.needMoreCorners'

/** Keeps only characters that can be part of a number. */
const numeric = (value: string) => value.replace(/[^0-9.,+\-\s]/g, '')

/**
 * Instructions and inputs while drawing an outline: type a length (and optionally an angle) and
 * press Enter to place the next corner exactly; Enter on an empty field finishes.
 */
export function DrawingPanel({ towards }: { towards: Point | null }) {
  const { t } = useTranslation()
  const corners = useUiStore((s) => s.drawing?.points.length ?? 0)
  const [length, setLength] = useState('')
  const [angle, setAngle] = useState('')
  const [error, setError] = useState<ErrorKey | null>(null)
  const lengthInput = useRef<HTMLInputElement>(null)
  const lengthId = useId()
  const angleId = useId()

  // Keep the length field focused, also after clicking a corner on the plan.
  useEffect(() => {
    lengthInput.current?.focus()
  }, [corners])

  function commit() {
    if (length.trim() === '') {
      if (!editorActions.finishDrawing()) setError('editor.drawing.needMoreCorners')
      return
    }
    const metres = parseNumber(length)
    const degrees = angle.trim() === '' ? undefined : parseNumber(angle)
    if (metres === undefined || metres <= 0) return setError('editor.drawing.invalidLength')
    if (angle.trim() !== '' && degrees === undefined) return setError('editor.drawing.invalidAngle')
    if (corners === 0) return setError('editor.drawing.needStart')
    editorActions.addDrawingSegment(metres, degrees, towards)
    setLength('')
    setAngle('')
    setError(null)
  }

  // Typing a number while the field isn't focused (e.g. after panning) still goes into it.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) return
      if (/^[0-9.,]$/.test(event.key)) {
        event.preventDefault()
        setLength((value) => value + event.key)
        lengthInput.current?.focus()
      } else if (event.key === 'Enter') {
        event.preventDefault()
        lengthInput.current?.focus()
        if (!editorActions.finishDrawing()) setError('editor.drawing.needMoreCorners')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      commit()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      editorActions.cancelDrawing()
    } else if (event.key === 'Backspace' && event.currentTarget.value === '') {
      event.preventDefault()
      editorActions.removeLastDrawingPoint()
    }
  }

  const hint =
    corners === 0
      ? t('editor.drawing.hintStart')
      : corners < MIN_PLOT_CORNERS
        ? t('editor.drawing.hintNext')
        : t('editor.drawing.hintFinish')

  return (
    <div className={styles.drawingPanel} data-testid="drawing-panel">
      <p className={styles.drawingHint} role="status">
        {hint}
      </p>
      <div className={styles.drawingInputs}>
        <label htmlFor={lengthId}>{t('editor.drawing.length')}</label>
        <input
          ref={lengthInput}
          id={lengthId}
          className={cx(controls.input, styles.drawingInput)}
          inputMode="decimal"
          autoComplete="off"
          value={length}
          aria-invalid={error === 'editor.drawing.invalidLength'}
          onChange={(e) => {
            setLength(numeric(e.target.value))
            setError(null)
          }}
          onKeyDown={onKeyDown}
        />
        <span>{t('editor.drawing.metres')}</span>
        <label htmlFor={angleId}>{t('editor.drawing.angle')}</label>
        <input
          id={angleId}
          className={cx(controls.input, styles.drawingInput)}
          inputMode="decimal"
          autoComplete="off"
          value={angle}
          aria-invalid={error === 'editor.drawing.invalidAngle'}
          onChange={(e) => {
            setAngle(numeric(e.target.value))
            setError(null)
          }}
          onKeyDown={onKeyDown}
        />
        <span>°</span>
        <button
          type="button"
          className={cx(controls.button, controls.primary, controls.small)}
          disabled={corners < MIN_PLOT_CORNERS}
          onClick={() => editorActions.finishDrawing()}
        >
          {t('editor.drawing.finish')}
        </button>
        <button
          type="button"
          className={cx(controls.button, controls.quiet, controls.small)}
          onClick={() => editorActions.cancelDrawing()}
        >
          {t('common.cancel')}
        </button>
      </div>
      <p className={styles.drawingKeys}>{t('editor.drawing.keys')}</p>
      {error && (
        <p className={controls.fieldError} role="alert">
          {t(error)}
        </p>
      )}
    </div>
  )
}
