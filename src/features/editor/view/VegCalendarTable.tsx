import { useTranslation } from 'react-i18next'
import { monthLong, monthShort } from '../../../i18n/months'
import {
  VEG_ACTIVITIES,
  type VegCalendar,
  type VegCalendarMonth,
  isQuietMonth,
} from '../../../model/vegCalendar'
import controls from '../../../styles/controls.module.css'
import { cx } from '../../../styles/cx'
import styles from './view.module.css'

/** Months as rows, the four activities as columns. Presentational, so other views can reuse it. */
export function VegCalendarTable({
  calendar,
  currentMonth,
  onMonth,
}: {
  calendar: VegCalendar
  currentMonth?: number
  onMonth?: (month: number) => void
}) {
  const { t } = useTranslation()
  return (
    <div className={styles.tableWrap}>
      <table className={styles.vegCalendar} data-testid="veg-calendar">
        <caption className={controls.visuallyHidden}>{t('editor.vegCalendar.caption')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('editor.vegCalendar.month')}</th>
            {VEG_ACTIVITIES.map((a) => (
              <th key={a} scope="col">
                {t(`editor.vegCalendar.activity.${a}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {calendar.months.map((m) => (
            <MonthRow key={m.month} m={m} current={m.month === currentMonth} onMonth={onMonth} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MonthRow({
  m,
  current,
  onMonth,
}: {
  m: VegCalendarMonth
  current: boolean
  onMonth: ((month: number) => void) | undefined
}) {
  const { t } = useTranslation()
  const quiet = isQuietMonth(m)
  return (
    <tr
      data-testid={`veg-month-${m.month}`}
      className={cx(current && styles.currentMonth)}
      aria-current={current ? 'date' : undefined}
    >
      <th scope="row" className={styles.vegMonth}>
        {onMonth ? (
          <button
            type="button"
            className={styles.monthButton}
            title={t('editor.vegCalendar.showMonth', { month: monthLong(m.month) })}
            onClick={() => onMonth(m.month)}
          >
            {monthShort(m.month)}
          </button>
        ) : (
          monthShort(m.month)
        )}
      </th>
      {quiet ? (
        <td colSpan={VEG_ACTIVITIES.length} className={styles.quietCell}>
          {t('editor.vegCalendar.quiet')}
        </td>
      ) : (
        VEG_ACTIVITIES.map((a) => (
          <td key={a} data-activity={a}>
            {m[a].map((crop) => crop.name).join(', ')}
          </td>
        ))
      )}
    </tr>
  )
}
