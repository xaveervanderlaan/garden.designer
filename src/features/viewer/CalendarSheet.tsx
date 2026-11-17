import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { currentLanguage } from '../../i18n'
import { vegCalendar } from '../../model/vegCalendar'
import type { Project } from '../../model/schema'
import { VegCalendarTable } from '../editor/view/VegCalendarTable'
import { BottomSheet } from './BottomSheet'
import styles from './viewer.module.css'

/** The vegetable calendar of the whole design, read-only, this month highlighted. */
export function CalendarSheet({ project, onClose }: { project: Project; onClose(): void }) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const [thisMonth] = useState(() => new Date().getMonth() + 1)
  const calendar = useMemo(() => vegCalendar(project, { lang }), [project, lang])
  return (
    <BottomSheet title={t('editor.vegCalendar.title')} onClose={onClose}>
      {calendar.crops.length === 0 ? (
        <p className={styles.sheetEmpty} data-testid="veg-calendar-empty">
          {t('editor.vegCalendar.empty')}
        </p>
      ) : (
        <VegCalendarTable calendar={calendar} currentMonth={thisMonth} />
      )}
    </BottomSheet>
  )
}
