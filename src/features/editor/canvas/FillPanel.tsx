import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { currentLanguage } from '../../../i18n'
import { formatDecimal, parseNumber } from '../../../i18n/units'
import { findBed } from '../../../model/beds'
import { findPlant, plantName } from '../../../model/plants'
import { MAX_FILL_PLANTS, fillBedPositions } from '../../../model/plantings'
import type { Project } from '../../../model/schema'
import { useUiStore } from '../../../store/uiStore'
import controls from '../../../styles/controls.module.css'
import { cx } from '../../../styles/cx'
import { editorActions } from '../actions'
import { useBedName } from '../panels/bedName'
import styles from './GardenCanvas.module.css'

const MIN_SPACING_M = 0.05
const MAX_SPACING_M = 50

/**
 * Filling a bed, below the plan: the plant, the bed (click one), the spacing and how many plants
 * that gives. The plan shows the pattern; Enter or "Fill bed" plants it (one undo step).
 */
export function FillPanel({ project, count }: { project: Project; count: number }) {
  const { t } = useTranslation()
  const fill = useUiStore((s) => s.fill)
  const spacingId = useId()
  const input = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(() => (fill ? formatDecimal(fill.spacingM) : ''))
  const bedName = useBedName(project)

  useEffect(() => input.current?.focus(), [])

  if (!fill) return null
  const plant = findPlant(project, fill.plantId)
  const name = plant ? plantName(plant, currentLanguage()) : ''
  const bed = fill.bedId ? findBed(project, fill.bedId) : undefined
  const parsed = parseNumber(text)
  const invalid = parsed === undefined || parsed < MIN_SPACING_M || parsed > MAX_SPACING_M
  const tooMany = !!bed && fillBedPositions(project, bed.id, fill.plantId, fill.spacingM).tooMany
  const canFill = !!bed && !invalid && count > 0

  function apply() {
    if (canFill) editorActions.applyFill()
  }

  return (
    <div className={styles.placingPanel} data-testid="fill-panel">
      <p className={styles.placingText} role="status">
        <span className={styles.drawingTitle}>{t('editor.placing.fillTitle', { name })}</span>
        {bed
          ? t('editor.placing.fillBed', { bed: bedName(bed) })
          : t('editor.placing.fillChooseBed')}
      </p>
      <div className={styles.placingControls}>
        <label htmlFor={spacingId}>{t('editor.placing.spacing')}</label>
        <input
          ref={input}
          id={spacingId}
          className={cx(controls.input, styles.drawingInput)}
          inputMode="decimal"
          autoComplete="off"
          value={text}
          aria-invalid={invalid}
          onChange={(e) => {
            setText(e.target.value)
            const value = parseNumber(e.target.value)
            if (value !== undefined && value >= MIN_SPACING_M && value <= MAX_SPACING_M) {
              editorActions.setFillSpacing(value)
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              apply()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              editorActions.stopPlacing()
            }
          }}
        />
        <span>{t('editor.drawing.metres')}</span>
        {bed && (
          <span className={styles.drawingMeasured} data-testid="fill-count">
            {t('editor.placing.plantCount', { count })}
          </span>
        )}
        <button
          type="button"
          className={cx(controls.button, controls.primary, controls.small)}
          disabled={!canFill}
          onClick={apply}
        >
          {t('editor.placing.fill')}
        </button>
        <button
          type="button"
          className={cx(controls.button, controls.quiet, controls.small)}
          onClick={editorActions.stopPlacing}
        >
          {t('common.cancel')}
        </button>
      </div>
      {invalid && (
        <p className={styles.placingError} role="alert">
          {t('editor.placing.invalidSpacing')}
        </p>
      )}
      {!invalid && tooMany && (
        <p className={styles.placingError} role="alert">
          {t('editor.placing.tooMany', { max: MAX_FILL_PLANTS })}
        </p>
      )}
      {!invalid && !tooMany && bed && count === 0 && (
        <p className={styles.placingError} role="alert">
          {t('editor.placing.noRoom')}
        </p>
      )}
    </div>
  )
}
