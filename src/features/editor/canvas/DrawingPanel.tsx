import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { rowPositions } from '../../../geometry/planting'
import { perimeter } from '../../../geometry/polygon'
import { currentLanguage } from '../../../i18n'
import { formatDecimal, formatLength, parseNumber } from '../../../i18n/units'
import { OBJECT_PRESETS } from '../../../model/objectKinds'
import { findPlant, plantName } from '../../../model/plants'
import type { Point } from '../../../model/schema'
import { useProjectStore } from '../../../store/projectStore'
import { type DrawTarget, useUiStore } from '../../../store/uiStore'
import controls from '../../../styles/controls.module.css'
import { cx } from '../../../styles/cx'
import { drawingShape, editorActions, minDrawingPoints } from '../actions'
import { isTypingTarget } from '../shortcuts'
import styles from './GardenCanvas.module.css'

type ErrorKey =
  | 'editor.drawing.invalidLength'
  | 'editor.drawing.invalidAngle'
  | 'editor.drawing.needStart'
  | 'editor.drawing.needMoreCorners'
  | 'editor.beds.needMoreCorners'
  | 'editor.placing.rowNeedsPoints'
  | 'editor.objects.drawing.needMoreCorners'
  | 'editor.objects.drawing.needMorePoints'
  | 'editor.measure.tooFew'

const NO_POINTS: readonly Point[] = []

/** The error for finishing too early, per thing being drawn (none for a symbol: one click places it). */
function tooFewError(target: DrawTarget): ErrorKey | null {
  switch (target.kind) {
    case 'plot':
    case 'design-area':
      return 'editor.drawing.needMoreCorners'
    case 'bed':
      return 'editor.beds.needMoreCorners'
    case 'row':
      return 'editor.placing.rowNeedsPoints'
    case 'measure':
      return 'editor.measure.tooFew'
    case 'object': {
      const shape = drawingShape(target)
      return shape === 'polygon'
        ? 'editor.objects.drawing.needMoreCorners'
        : shape === 'polyline'
          ? 'editor.objects.drawing.needMorePoints'
          : null
    }
  }
}

/** Keeps only characters that can be part of a number. */
const numeric = (value: string) => value.replace(/[^0-9.,+\-\s]/g, '')

/**
 * Instructions and inputs while drawing an outline: type a length (and optionally an angle) and
 * press Enter to place the next corner exactly; Enter on an empty field finishes.
 */
export function DrawingPanel({ towards }: { towards: Point | null }) {
  const { t } = useTranslation()
  const target = useUiStore((s) => s.drawing?.target) ?? { kind: 'plot' }
  const points = useUiStore((s) => s.drawing?.points) ?? NO_POINTS
  const corners = points.length
  const minimum = minDrawingPoints(target)
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
      if (!editorActions.finishDrawing()) setError(tooFewError(target))
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
        const drawing = useUiStore.getState().drawing
        if (!editorActions.finishDrawing() && drawing) setError(tooFewError(drawing.target))
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

  const shape = drawingShape(target)
  const measuring = target.kind === 'measure'
  const isObject = target.kind === 'object'
  const defaultSize =
    target.kind === 'object' && corners === 0 ? OBJECT_PRESETS[target.objectKind].sizeM : undefined
  const hint = measuring
    ? t('editor.measure.hint')
    : corners === 0
      ? isObject
        ? t(
            shape === 'polygon'
              ? 'editor.objects.drawing.hintStartOutline'
              : shape === 'polyline'
                ? 'editor.objects.drawing.hintStartLine'
                : 'editor.objects.drawing.hintStartPoint',
          )
        : target.kind === 'design-area'
          ? t('proposals.area.drawHint')
          : t('editor.drawing.hintStart')
      : corners < minimum
        ? t('editor.drawing.hintNext')
        : target.kind === 'row'
          ? t('editor.placing.rowHintFinish')
          : isObject && shape === 'polyline'
            ? t('editor.objects.drawing.hintFinishLine')
            : t('editor.drawing.hintFinish')

  return (
    <div className={styles.drawingPanel} data-testid="drawing-panel">
      <p className={styles.drawingHint} role="status">
        <DrawingTitle target={target} />
        {hint}
      </p>
      <div className={styles.drawingInputs}>
        {shape !== 'point' && (
          <>
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
          </>
        )}
        {measuring && (
          <span className={styles.drawingMeasured}>
            {t('editor.measure.total')}{' '}
            <output data-testid="measure-total">{formatLength(perimeter(points, false))}</output>
          </span>
        )}
        {target.kind === 'row' && (
          <RowSpacing spacingM={target.spacingM} count={rowCount(points, target.spacingM)} />
        )}
        <span className={styles.drawingButtons}>
          {defaultSize && (
            <button
              type="button"
              className={cx(controls.button, controls.small)}
              data-testid="place-default-size"
              onClick={() => editorActions.placeDefaultSize()}
            >
              {t('editor.objects.drawing.defaultSize', {
                size: t('editor.objects.sizeValue', {
                  width: formatDecimal(defaultSize.width, 1),
                  depth: formatDecimal(defaultSize.depth, 1),
                }),
              })}
            </button>
          )}
          {shape !== 'point' && (
            <button
              type="button"
              className={cx(controls.button, controls.primary, controls.small)}
              disabled={corners < minimum}
              onClick={() => editorActions.finishDrawing()}
            >
              {target.kind === 'row'
                ? t('editor.placing.plantRow')
                : measuring
                  ? t('editor.measure.keep')
                  : t('editor.drawing.finish')}
            </button>
          )}
          <button
            type="button"
            className={cx(controls.button, controls.quiet, controls.small)}
            onClick={() => editorActions.cancelDrawing()}
          >
            {measuring ? t('editor.measure.done') : t('common.cancel')}
          </button>
        </span>
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

/** Plants the row will get when finished now (null before it has two points). */
const rowCount = (points: readonly Point[], spacing: number) =>
  points.length >= 2 ? rowPositions(points, spacing).length : null

/** What is being drawn, in bold before the hint. */
function DrawingTitle({ target }: { target: DrawTarget }) {
  const { t } = useTranslation()
  const plantId = target.kind === 'row' ? target.plantId : null
  const plant = useProjectStore((s) =>
    s.project && plantId ? findPlant(s.project, plantId) : null,
  )
  const title =
    target.kind === 'plot'
      ? t('editor.drawing.titlePlot')
      : target.kind === 'bed'
        ? t(`editor.beds.drawing.${target.bedKind}`)
        : target.kind === 'object'
          ? t('editor.objects.drawing.title', {
              kind: t(`editor.objectKinds.${target.objectKind}`),
            })
          : target.kind === 'measure'
            ? t('editor.measure.title')
            : target.kind === 'design-area'
              ? t('proposals.area.drawTitle')
              : t('editor.placing.rowTitle', {
                  name: plant ? plantName(plant, currentLanguage()) : '',
                })
  return <span className={styles.drawingTitle}>{title}</span>
}

/** The spacing between the plants of a row, applied as you type. */
function RowSpacing({ spacingM, count }: { spacingM: number; count: number | null }) {
  const { t } = useTranslation()
  const id = useId()
  const [text, setText] = useState(() => formatDecimal(spacingM))
  const valid = (value: number | undefined): value is number =>
    value !== undefined && value >= 0.05 && value <= 50
  const invalid = !valid(parseNumber(text))
  return (
    <>
      <label htmlFor={id}>{t('editor.placing.spacing')}</label>
      <input
        id={id}
        className={cx(controls.input, styles.drawingInput)}
        inputMode="decimal"
        autoComplete="off"
        value={text}
        aria-invalid={invalid}
        onChange={(e) => {
          setText(e.target.value)
          const value = parseNumber(e.target.value)
          if (valid(value)) editorActions.setRowSpacing(value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            editorActions.finishDrawing()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            editorActions.cancelDrawing()
          }
        }}
      />
      <span>{t('editor.drawing.metres')}</span>
      {count !== null && (
        <span className={styles.drawingMeasured} data-testid="row-count">
          {t('editor.placing.plantCount', { count })}
        </span>
      )}
    </>
  )
}
