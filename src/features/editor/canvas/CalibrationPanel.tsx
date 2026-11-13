import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { distance } from '../../../geometry/polygon'
import { formatLength, parseNumber } from '../../../i18n/units'
import { useUiStore } from '../../../store/uiStore'
import controls from '../../../styles/controls.module.css'
import { cx } from '../../../styles/cx'
import { editorActions } from '../actions'
import styles from './GardenCanvas.module.css'

type ErrorKey =
  | 'editor.calibration.invalidDistance'
  | 'editor.calibration.needPoints'
  | 'editor.calibration.tooShort'

/**
 * Calibrating the site plan: click both ends of a distance you know (e.g. a dimensioned edge on
 * the plan), type its real length and press Enter. The distance can also be typed first.
 */
export function CalibrationPanel() {
  const { t } = useTranslation()
  const points = useUiStore((s) => s.calibration?.points)
  const count = points?.length ?? 0
  const [text, setText] = useState('')
  const [error, setError] = useState<ErrorKey | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const inputId = useId()

  // Keep the distance field focused, also after clicking a point on the plan.
  useEffect(() => {
    input.current?.focus()
  }, [count])

  function apply() {
    const metres = parseNumber(text)
    if (metres === undefined || metres <= 0) return setError('editor.calibration.invalidDistance')
    if (count < 2) return setError('editor.calibration.needPoints')
    if (!editorActions.applyCalibration(metres)) setError('editor.calibration.tooShort')
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      apply()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      editorActions.cancelCalibration()
    } else if (event.key === 'Backspace' && event.currentTarget.value === '') {
      event.preventDefault()
      editorActions.removeLastCalibrationPoint()
    }
  }

  const hint =
    count === 0
      ? t('editor.calibration.hintStart')
      : count === 1
        ? t('editor.calibration.hintEnd')
        : t('editor.calibration.hintDistance')
  const [a, b] = points ?? []

  return (
    <div className={styles.drawingPanel} data-testid="calibration-panel">
      <p className={styles.drawingHint} role="status">
        {hint}
      </p>
      <div className={styles.drawingInputs}>
        <label htmlFor={inputId}>{t('editor.calibration.distance')}</label>
        <input
          ref={input}
          id={inputId}
          className={cx(controls.input, styles.drawingInput)}
          inputMode="decimal"
          autoComplete="off"
          value={text}
          aria-invalid={error === 'editor.calibration.invalidDistance'}
          onChange={(e) => {
            setText(e.target.value)
            setError(null)
          }}
          onKeyDown={onKeyDown}
        />
        <span>{t('editor.drawing.metres')}</span>
        <button
          type="button"
          className={cx(controls.button, controls.primary, controls.small)}
          disabled={count < 2}
          onClick={apply}
        >
          {t('editor.calibration.apply')}
        </button>
        <button
          type="button"
          className={cx(controls.button, controls.quiet, controls.small)}
          onClick={() => editorActions.cancelCalibration()}
        >
          {t('common.cancel')}
        </button>
        {a && b && (
          <span className={styles.drawingMeasured} data-testid="calibration-measured">
            {t('editor.calibration.measured', { length: formatLength(distance(a, b)) })}
          </span>
        )}
      </div>
      <p className={styles.drawingKeys}>{t('editor.calibration.keys')}</p>
      {error && (
        <p className={controls.fieldError} role="alert">
          {t(error)}
        </p>
      )}
    </div>
  )
}
