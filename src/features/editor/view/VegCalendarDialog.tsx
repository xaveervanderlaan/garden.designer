import { X } from 'lucide-react'
import { useEffect, useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { currentLanguage } from '../../../i18n'
import { bedsOf } from '../../../model/beds'
import { vegCalendar } from '../../../model/vegCalendar'
import { useProjectStore } from '../../../store/projectStore'
import { useUiStore } from '../../../store/uiStore'
import controls from '../../../styles/controls.module.css'
import { cx } from '../../../styles/cx'
import { useBedName } from '../panels/bedName'
import panels from '../panels/panels.module.css'
import styles from './view.module.css'
import { VegCalendarTable } from './VegCalendarTable'

/** The vegetable calendar (M15): what to sow, plant out and harvest per month. */
export function VegCalendarDialog() {
  const state = useUiStore((s) => s.vegCalendar)
  const project = useProjectStore((s) => s.project)
  if (!state || !project) return null
  return <VegCalendarContent presetBedId={state.bedId} />
}

function VegCalendarContent({ presetBedId }: { presetBedId: string | null }) {
  const { t } = useTranslation()
  const project = useProjectStore((s) => s.project)
  const lang = currentLanguage()
  const titleId = useId()
  const scopeId = useId()
  const bedName = useBedName(project!)
  const [chosenBed, setChosenBed] = useState(presetBedId ?? '')
  const beds = useMemo(() => {
    if (!project) return []
    const withCrops = new Set(
      vegCalendar(project, { lang })
        .crops.flatMap((c) =>
          project.plantings.filter((p) => p.plantId === c.plant.id).map((p) => p.bedId),
        )
        .filter((id): id is string => id != null),
    )
    return bedsOf(project).filter((b) => withCrops.has(b.id) || b.id === presetBedId)
  }, [project, lang, presetBedId])
  // A bed that was deleted (undo while open) falls back to the whole design.
  const bedId = beds.some((b) => b.id === chosenBed) ? chosenBed : ''
  const calendar = useMemo(
    () => (project ? vegCalendar(project, { lang, ...(bedId ? { bedId } : {}) }) : null),
    [project, lang, bedId],
  )
  const close = () => useUiStore.getState().closeVegCalendar()
  const [thisMonth] = useState(() => new Date().getMonth() + 1)

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        useUiStore.getState().closeVegCalendar()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [])

  if (!calendar) return null
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
            {t('editor.vegCalendar.title')}
          </h2>
          <button
            type="button"
            autoFocus
            className={panels.iconButton}
            aria-label={t('editor.vegCalendar.close')}
            onClick={close}
          >
            <X size={18} aria-hidden />
          </button>
        </div>
        {beds.length > 0 && (
          <div className={styles.scope}>
            <label htmlFor={scopeId}>{t('editor.vegCalendar.scope')}</label>
            <select
              id={scopeId}
              className={cx(controls.input, styles.select)}
              value={bedId}
              onChange={(e) => setChosenBed(e.target.value)}
            >
              <option value="">{t('editor.vegCalendar.whole')}</option>
              {beds.map((bed) => (
                <option key={bed.id} value={bed.id}>
                  {bedName(bed)}
                </option>
              ))}
            </select>
          </div>
        )}
        {calendar.crops.length === 0 ? (
          <p className={styles.chartEmpty} data-testid="veg-calendar-empty">
            {bedId ? t('editor.vegCalendar.emptyBed') : t('editor.vegCalendar.empty')}
          </p>
        ) : (
          <VegCalendarTable
            calendar={calendar}
            currentMonth={thisMonth}
            onMonth={(month) => {
              useUiStore.getState().setMonth(month)
              close()
            }}
          />
        )}
      </div>
    </div>
  )
}
