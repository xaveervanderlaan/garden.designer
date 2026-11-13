import { PenTool, RectangleHorizontal, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { edgeLengths, isSelfIntersecting, perimeter, polygonArea } from '../../../geometry/polygon'
import { formatArea, formatLength } from '../../../i18n/units'
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
import { NumberField } from './NumberField'
import { SitePlanStart } from './SitePlanProperties'
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
      <SitePlanStart project={project} />
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
              <NumberField
                value={length}
                label={t('editor.plot.edgeLength', { from, to })}
                accept={(value) => value > 0}
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
