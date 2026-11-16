import { X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { currentLanguage } from '../../../i18n'
import { formatMonths, monthLong, monthShort } from '../../../i18n/months'
import { bedsOf } from '../../../model/beds'
import { type BloomChartMonth, type BloomSpecies, bloomChart } from '../../../model/bloomChart'
import type { FlowerColor, Project } from '../../../model/schema'
import { useProjectStore } from '../../../store/projectStore'
import { useUiStore } from '../../../store/uiStore'
import controls from '../../../styles/controls.module.css'
import { cx } from '../../../styles/cx'
import { PLANT_COLOR_HEX, needsOutline } from '../../../styles/plantColors'
import { PlantSymbol } from '../../library/parts'
import { useBedName } from '../panels/bedName'
import panels from '../panels/panels.module.css'
import styles from './view.module.css'

/** A chip's background: one colour, or equal stripes of each. */
function chipBackground(colors: readonly FlowerColor[]): string {
  const hex = colors.map((c) => PLANT_COLOR_HEX[c])
  if (hex.length <= 1) return hex[0] ?? 'transparent'
  const step = 100 / hex.length
  return `linear-gradient(90deg, ${hex.map((h, i) => `${h} ${i * step}% ${(i + 1) * step}%`).join(', ')})`
}

/** The bloom chart (M14): which plants flower in which month, for the design or one bed. */
export function BloomChartDialog() {
  const open = useUiStore((s) => s.bloomChartOpen)
  const project = useProjectStore((s) => s.project)
  if (!open || !project) return null
  return <BloomChart project={project} />
}

function BloomChart({ project }: { project: Project }) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const titleId = useId()
  const scopeId = useId()
  const closeButton = useRef<HTMLButtonElement>(null)
  const bedName = useBedName(project)
  const beds = bedsOf(project)
  const [chosenBed, setChosenBed] = useState('')
  // A bed that was deleted (undo while the chart is open) falls back to the whole design.
  const bedId = beds.some((b) => b.id === chosenBed) ? chosenBed : ''
  const chart = useMemo(
    () => bloomChart(project, { lang, ...(bedId ? { bedId } : {}) }),
    [project, lang, bedId],
  )
  const close = () => useUiStore.getState().setBloomChartOpen(false)

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    closeButton.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        useUiStore.getState().setBloomChartOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [])

  /** Shows a month on the plan and closes the chart. */
  function showMonth(month: number) {
    useUiStore.getState().setMonth(month)
    close()
  }

  const colorName = (color: FlowerColor) => t(`plants.colors.${color}`).toLowerCase()
  const speciesColors = (s: BloomSpecies) => s.colors.map(colorName).join(', ')
  const monthSummary = (m: BloomChartMonth) =>
    [
      t('editor.bloomChart.inBloom', { count: m.count }),
      ...m.colors.map((c) =>
        t('editor.bloomChart.colorCount', { count: c.count, color: colorName(c.color) }),
      ),
    ].join(', ')
  const isEmpty = (m: BloomChartMonth) => m.species.length === 0

  return (
    <div className={panels.backdrop} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div
        className={cx(panels.dialog, styles.chartDialog)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className={panels.dialogHeader}>
          <h2 id={titleId} className={panels.dialogTitle}>
            {t('editor.bloomChart.title')}
          </h2>
          <button
            ref={closeButton}
            type="button"
            className={panels.iconButton}
            aria-label={t('editor.bloomChart.close')}
            onClick={close}
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        {beds.length > 0 && (
          <div className={styles.scope}>
            <label htmlFor={scopeId}>{t('editor.bloomChart.scope')}</label>
            <select
              id={scopeId}
              className={cx(controls.input, styles.select)}
              value={bedId}
              onChange={(e) => setChosenBed(e.target.value)}
            >
              <option value="">{t('editor.bloomChart.whole')}</option>
              {beds.map((bed) => (
                <option key={bed.id} value={bed.id}>
                  {bedName(bed)}
                </option>
              ))}
            </select>
          </div>
        )}

        {chart.species.length === 0 ? (
          <p className={styles.chartEmpty} data-testid="bloom-chart-empty">
            {bedId ? t('editor.bloomChart.emptyBed') : t('editor.bloomChart.empty')}
          </p>
        ) : (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.chart} data-testid="bloom-chart">
                <caption className={controls.visuallyHidden}>
                  {t('editor.bloomChart.caption')}
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className={styles.nameHead}>
                      {t('editor.bloomChart.plant')}
                    </th>
                    {chart.months.map((m) => (
                      <th
                        key={m.month}
                        scope="col"
                        className={cx(styles.monthHead, isEmpty(m) && styles.emptyMonth)}
                        abbr={monthLong(m.month)}
                      >
                        <button
                          type="button"
                          className={styles.monthButton}
                          title={t('editor.bloomChart.showMonth', { month: monthLong(m.month) })}
                          onClick={() => showMonth(m.month)}
                        >
                          {monthShort(m.month)}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className={styles.summaryRow}>
                    <th scope="row" className={styles.nameCell}>
                      {t('editor.bloomChart.all')}
                    </th>
                    {chart.months.map((m) => (
                      <td
                        key={m.month}
                        className={cx(styles.cell, isEmpty(m) && styles.emptyMonth)}
                        data-testid="bloom-summary"
                      >
                        {m.count > 0 && (
                          <span className={styles.band} title={monthSummary(m)} aria-hidden>
                            {m.colors.map((c) => (
                              <span
                                key={c.color}
                                className={cx(needsOutline(c.color) && styles.light)}
                                style={{ flexGrow: c.count, background: PLANT_COLOR_HEX[c.color] }}
                              />
                            ))}
                          </span>
                        )}
                        {m.count > 0 && (
                          <span className={controls.visuallyHidden}>{monthSummary(m)}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                  {chart.species.map((s) => (
                    <tr key={s.plant.id} data-testid="bloom-row">
                      <th scope="row" className={styles.nameCell}>
                        <span className={styles.name}>
                          <PlantSymbol plant={s.plant} size={16} />
                          <span>
                            {s.name}
                            <span className={styles.count}>
                              {t('editor.bloomChart.count', { count: s.count })}
                            </span>
                          </span>
                        </span>
                      </th>
                      {chart.months.map((m) => {
                        const on = m.species.includes(s)
                        return (
                          <td
                            key={m.month}
                            className={cx(styles.cell, isEmpty(m) && styles.emptyMonth)}
                            data-bloom={on || undefined}
                          >
                            {on && (
                              <>
                                <span
                                  className={cx(
                                    styles.chip,
                                    s.colors.some(needsOutline) && styles.light,
                                  )}
                                  style={{ background: chipBackground(s.colors) }}
                                  title={speciesColors(s)}
                                  aria-hidden
                                />
                                <span className={controls.visuallyHidden}>{speciesColors(s)}</span>
                              </>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={styles.chartHint} data-testid="bloom-chart-hint">
              {chart.emptyMonths.length > 0
                ? t('editor.bloomChart.emptyMonths', { months: formatMonths(chart.emptyMonths) })
                : t('editor.bloomChart.allMonths')}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
