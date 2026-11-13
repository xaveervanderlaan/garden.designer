import { PenTool, RectangleHorizontal, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { edgeLengths, isSelfIntersecting, perimeter, polygonArea } from '../../../geometry/polygon'
import { formatArea, formatLength, formatNumber, parseNumber } from '../../../i18n/units'
import { isLayerEditable } from '../../../model/edit'
import {
  MIN_PLOT_CORNERS,
  PLOT_LAYER,
  cornerLabel,
  hasPlot,
  setPlotEdgeLength,
} from '../../../model/plot'
import type { Project } from '../../../model/schema'
import { useProjectStore } from '../../../store/projectStore'
import { useUiStore } from '../../../store/uiStore'
import controls from '../../../styles/controls.module.css'
import { cx } from '../../../styles/cx'
import { editorActions } from '../actions'
import { shortcutLabel } from '../shortcuts'
import styles from './panels.module.css'

/** Nothing selected: a hint, plus the way to start (or edit) the plot outline. */
export function NothingSelected({ project }: { project: Project }) {
  const { t } = useTranslation()
  const plotEditable = isLayerEditable(project, PLOT_LAYER)
  return (
    <>
      <p className={styles.text}>{t('editor.properties.nothingSelected')}</p>
      <p className={styles.hint}>{t('editor.properties.hint')}</p>
      {plotEditable && (
        <div className={styles.buttonColumn}>
          {hasPlot(project) ? (
            <button
              type="button"
              className={cx(controls.button, controls.small)}
              onClick={editorActions.selectPlot}
            >
              {t('editor.plot.edit')}
            </button>
          ) : (
            <>
              <button
                type="button"
                className={cx(controls.button, controls.small)}
                title={shortcutLabel('drawPlot')}
                onClick={() => editorActions.setTool('draw-plot')}
              >
                <PenTool size={16} aria-hidden />
                {t('editor.toolbar.drawPlot')}
              </button>
              <button
                type="button"
                className={cx(controls.button, controls.small)}
                title={shortcutLabel('rectanglePlot')}
                onClick={() => useUiStore.getState().setRectangleDialogOpen(true)}
              >
                <RectangleHorizontal size={16} aria-hidden />
                {t('editor.toolbar.rectanglePlot')}
              </button>
            </>
          )}
        </div>
      )}
    </>
  )
}

/** The plot: area, perimeter, and every edge length (editable). */
export function PlotProperties({ project }: { project: Project }) {
  const { t } = useTranslation()
  const activeCorner = useUiStore((s) => s.activeCorner)
  const outline = project.plot.outline
  const n = outline.length
  const lengths = edgeLengths(outline)

  return (
    <>
      <dl className={styles.facts}>
        <dt>{t('editor.properties.kind')}</dt>
        <dd data-testid="item-kind">{t('editor.plot.title')}</dd>
        <dt>{t('editor.plot.area')}</dt>
        <dd data-testid="plot-area">{formatArea(polygonArea(outline))}</dd>
        <dt>{t('editor.plot.perimeter')}</dt>
        <dd data-testid="plot-perimeter">{formatLength(perimeter(outline))}</dd>
        <dt>{t('editor.plot.corners')}</dt>
        <dd>{n}</dd>
      </dl>

      {isSelfIntersecting(outline) && (
        <p className={styles.warning} role="alert">
          {t('editor.plot.selfIntersecting')}
        </p>
      )}

      <h3 className={styles.subtitle}>{t('editor.plot.edges')}</h3>
      <ul className={styles.edgeList}>
        {lengths.map((length, i) => {
          const from = cornerLabel(i)
          const to = cornerLabel((i + 1) % n)
          return (
            <li key={i} className={styles.edgeRow}>
              <span className={styles.edgeName}>{t('editor.plot.edge', { from, to })}</span>
              <EdgeLengthInput
                length={length}
                label={t('editor.plot.edgeLength', { from, to })}
                onCommit={(value) =>
                  useProjectStore.getState().update((p) => setPlotEdgeLength(p, i, value))
                }
              />
              <span aria-hidden>{t('editor.drawing.metres')}</span>
            </li>
          )
        })}
      </ul>

      {activeCorner !== null && activeCorner < n ? (
        <div className={styles.buttonColumn}>
          <button
            type="button"
            className={cx(controls.button, controls.small, styles.deleteButton)}
            disabled={n <= MIN_PLOT_CORNERS}
            title={n <= MIN_PLOT_CORNERS ? t('editor.plot.minCorners') : undefined}
            onClick={() => editorActions.removeCorner(activeCorner)}
          >
            <Trash2 size={16} aria-hidden />
            {t('editor.plot.removeCorner', { corner: cornerLabel(activeCorner) })}
          </button>
        </div>
      ) : (
        <p className={styles.hint}>{t('editor.plot.cornerHint')}</p>
      )}
    </>
  )
}

/** A length field that applies its value on Enter or when leaving the field. */
function EdgeLengthInput({
  length,
  label,
  onCommit,
}: {
  length: number
  label: string
  onCommit: (metres: number) => void
}) {
  const formatted = formatNumber(length, 2)
  const [text, setText] = useState(formatted)
  const [invalid, setInvalid] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  /** Set by Escape: the blur that follows must not apply the typed value. */
  const cancelled = useRef(false)

  // Follow outside changes (dragging corners, undo) unless the user is typing here.
  useEffect(() => {
    if (document.activeElement !== input.current) setText(formatted)
  }, [formatted])

  function apply() {
    if (cancelled.current) {
      cancelled.current = false
      setText(formatted)
      setInvalid(false)
      return
    }
    const value = parseNumber(text)
    if (value === undefined || value <= 0) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    if (formatNumber(value, 2) !== formatted) onCommit(value)
    else setText(formatted)
  }

  return (
    <input
      ref={input}
      className={cx(controls.input, styles.edgeInput)}
      aria-label={label}
      aria-invalid={invalid}
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        setInvalid(false)
      }}
      onBlur={apply}
      // Leaving the field applies the value; Enter leaves it, Escape leaves it without applying.
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur()
        } else if (e.key === 'Escape') {
          cancelled.current = true
          e.currentTarget.blur()
        }
      }}
    />
  )
}
