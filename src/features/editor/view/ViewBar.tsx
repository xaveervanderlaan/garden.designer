import { CalendarDays, ChartGantt, ChevronLeft, ChevronRight, Sprout } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { monthLong } from '../../../i18n/months'
import { type GrowthStop, growthReferenceYear, growthStops } from '../../../model/growth'
import { MONTHS, type Project } from '../../../model/schema'
import { useUiStore } from '../../../store/uiStore'
import controls from '../../../styles/controls.module.css'
import { cx } from '../../../styles/cx'
import { currentYear } from '../actions'
import { stepMonth } from './plantView'
import { SunControls } from './SunControls'
import styles from './view.module.css'

/**
 * How the plan shows the plants: the year (growth, M13) and the month (season, M14), and the
 * bloom chart. A slim bar above the plan; view state only, so nothing here is undone or saved.
 * There is room on the right for the sun's date and time (M11).
 */
export function ViewBar({ project }: { project: Project }) {
  const { t } = useTranslation()
  const stop = useUiStore((s) => s.growthStop)
  const month = useUiStore((s) => s.month)
  const { setGrowthStop, setMonth, setBloomChartOpen } = useUiStore.getState()
  const yearId = useId()
  const ticksId = useId()
  const monthId = useId()
  const stops = growthStops(growthReferenceYear(project, currentYear()))
  const index = Math.max(
    0,
    stops.findIndex((s) => s.id === stop),
  )
  const yearText = (s: GrowthStop) =>
    s.view === 'mature'
      ? t('editor.view.yearValue.mature')
      : s.offsetYears === 0
        ? t('editor.view.yearValue.planting', { year: s.view })
        : t('editor.view.yearValue.after', { year: s.view, count: s.offsetYears ?? 0 })
  const current = yearText(stops[index]!)
  const icon = { size: 16, 'aria-hidden': true } as const

  return (
    <div className={styles.viewBar} role="group" aria-label={t('editor.view.label')}>
      <div
        className={styles.control}
        data-active={stop !== 'mature' || undefined}
        title={t('editor.view.yearHint')}
      >
        <Sprout {...icon} className={styles.icon} />
        <label className={styles.label} htmlFor={yearId}>
          {t('editor.view.year')}
        </label>
        <input
          id={yearId}
          className={styles.slider}
          type="range"
          min={0}
          max={stops.length - 1}
          step={1}
          value={index}
          list={ticksId}
          aria-valuetext={current}
          onChange={(e) => setGrowthStop(stops[Number(e.target.value)]!.id)}
        />
        <datalist id={ticksId}>
          {stops.map((s, i) => (
            <option key={s.id} value={i} />
          ))}
        </datalist>
        <span className={styles.value} data-testid="view-year">
          {current}
        </span>
      </div>

      <div
        className={styles.control}
        data-active={month !== null || undefined}
        title={t('editor.view.monthHint')}
      >
        <CalendarDays {...icon} className={styles.icon} />
        <label className={styles.label} htmlFor={monthId}>
          {t('editor.view.month')}
        </label>
        <button
          type="button"
          className={styles.stepButton}
          aria-label={t('editor.view.previousMonth')}
          title={t('editor.view.previousMonth')}
          onClick={() => setMonth(stepMonth(month, -1))}
        >
          <ChevronLeft {...icon} />
        </button>
        <select
          id={monthId}
          className={cx(controls.input, styles.select)}
          value={month ?? ''}
          onChange={(e) => setMonth(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">{t('editor.view.noMonth')}</option>
          {MONTHS.map((m) => (
            <option key={m} value={m}>
              {monthLong(m)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={styles.stepButton}
          aria-label={t('editor.view.nextMonth')}
          title={t('editor.view.nextMonth')}
          onClick={() => setMonth(stepMonth(month, 1))}
        >
          <ChevronRight {...icon} />
        </button>
      </div>

      <button
        type="button"
        className={cx(controls.button, controls.small, controls.quiet, styles.chartButton)}
        onClick={() => setBloomChartOpen(true)}
      >
        <ChartGantt {...icon} />
        {t('editor.view.bloomChart')}
      </button>

      <SunControls project={project} />
    </div>
  )
}
