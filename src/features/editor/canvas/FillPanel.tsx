import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { currentLanguage } from '../../../i18n'
import { formatDecimal, parseNumber } from '../../../i18n/units'
import { findBed } from '../../../model/beds'
import { findPlant, plantName } from '../../../model/plants'
import { MAX_FILL_PLANTS } from '../../../model/plantings'
import type { Project } from '../../../model/schema'
import type { BedFill } from '../../../model/vegRows'
import { useUiStore } from '../../../store/uiStore'
import controls from '../../../styles/controls.module.css'
import { cx } from '../../../styles/cx'
import { editorActions } from '../actions'
import { useBedName } from '../panels/bedName'
import styles from './GardenCanvas.module.css'

const MIN_SPACING_M = 0.01
const MAX_SPACING_M = 50

function validSpacing(text: string): number | undefined {
  const value = parseNumber(text)
  return value !== undefined && value >= MIN_SPACING_M && value <= MAX_SPACING_M ? value : undefined
}

/** The rows field: empty = all rows (null), a whole number ≥ 1, else undefined (invalid). */
function parseRows(text: string): number | null | undefined {
  if (text.trim() === '') return null
  const value = parseNumber(text)
  return value !== undefined && Number.isInteger(value) && value >= 1 ? value : undefined
}

/**
 * Filling a bed, below the plan: the plant, the bed (click one), the spacing and how many plants
 * that gives. A crop in a vegetable or raised bed is laid out in rows: in-row spacing, row spacing
 * and how many rows. The plan shows the pattern; Enter or "Fill bed" plants it (one undo step).
 */
export function FillPanel({ project, result }: { project: Project; result: BedFill }) {
  const { t } = useTranslation()
  const fill = useUiStore((s) => s.fill)
  const spacingId = useId()
  const rowSpacingId = useId()
  const rowsId = useId()
  const input = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(() => (fill ? formatDecimal(fill.spacingM) : ''))
  const [rowText, setRowText] = useState(() =>
    fill?.rowSpacingM !== undefined ? formatDecimal(fill.rowSpacingM) : '',
  )
  const [rowsText, setRowsText] = useState(() => (fill?.rows ? String(fill.rows) : ''))
  const bedName = useBedName(project)

  useEffect(() => input.current?.focus(), [])

  if (!fill) return null
  const plant = findPlant(project, fill.plantId)
  const name = plant ? plantName(plant, currentLanguage()) : ''
  const bed = fill.bedId ? findBed(project, fill.bedId) : undefined
  const { rowMode, tooMany } = result
  const count = result.positions.length
  const invalidSpacing =
    validSpacing(text) === undefined || (rowMode && validSpacing(rowText) === undefined)
  const invalidRows = rowMode && parseRows(rowsText) === undefined
  const invalid = invalidSpacing || invalidRows
  const canFill = !!bed && !invalid && count > 0

  function apply() {
    if (canFill) editorActions.applyFill()
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      apply()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      editorActions.stopPlacing()
    }
  }

  const inputProps = {
    className: cx(controls.input, styles.drawingInput),
    inputMode: 'decimal' as const,
    autoComplete: 'off',
    onKeyDown,
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
        <label htmlFor={spacingId}>
          {t(rowMode ? 'editor.placing.inRowSpacing' : 'editor.placing.spacing')}
        </label>
        <input
          {...inputProps}
          ref={input}
          id={spacingId}
          value={text}
          aria-invalid={validSpacing(text) === undefined}
          onChange={(e) => {
            setText(e.target.value)
            const value = validSpacing(e.target.value)
            if (value !== undefined) editorActions.setFillSpacing(value)
          }}
        />
        <span>{t('editor.drawing.metres')}</span>
        {rowMode && (
          <>
            <label htmlFor={rowSpacingId}>{t('editor.placing.rowSpacing')}</label>
            <input
              {...inputProps}
              id={rowSpacingId}
              value={rowText}
              aria-invalid={validSpacing(rowText) === undefined}
              onChange={(e) => {
                setRowText(e.target.value)
                const value = validSpacing(e.target.value)
                if (value !== undefined) editorActions.setFillRowSpacing(value)
              }}
            />
            <span>{t('editor.drawing.metres')}</span>
            <label htmlFor={rowsId}>{t('editor.placing.rows')}</label>
            <input
              {...inputProps}
              id={rowsId}
              inputMode="numeric"
              placeholder={t('editor.placing.rowsAll')}
              value={rowsText}
              aria-invalid={parseRows(rowsText) === undefined}
              onChange={(e) => {
                setRowsText(e.target.value)
                const value = parseRows(e.target.value)
                if (value !== undefined) editorActions.setFillRows(value ?? undefined)
              }}
            />
          </>
        )}
        {bed && rowMode && (
          <span className={styles.drawingMeasured} data-testid="fill-rows">
            {t('editor.placing.rowCount', { count: result.rowCount })}
          </span>
        )}
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
      {invalidSpacing && (
        <p className={styles.placingError} role="alert">
          {t('editor.placing.invalidSpacing')}
        </p>
      )}
      {!invalidSpacing && invalidRows && (
        <p className={styles.placingError} role="alert">
          {t('editor.placing.invalidRows')}
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
