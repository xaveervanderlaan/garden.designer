import { CalendarDays, RotateCw } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import type { Bed } from '../../../model/beds'
import { bedRowAngle } from '../../../model/vegRows'
import controls from '../../../styles/controls.module.css'
import { cx } from '../../../styles/cx'
import { useUiStore } from '../../../store/uiStore'
import { editorActions } from '../actions'
import { NumberField } from './NumberField'
import styles from './panels.module.css'

/** A vegetable or raised bed's row direction: degrees (map-style) and "Turn 90°". */
export function RowDirection({ bed }: { bed: Bed }) {
  const { t } = useTranslation()
  const id = useId()
  const label = t('editor.beds.rowDirection')
  return (
    <>
      <div className={styles.inlineField} data-testid="bed-row-direction">
        <label className={styles.inlineLabel} htmlFor={id}>
          {label}
        </label>
        <NumberField
          id={id}
          value={bedRowAngle(bed)}
          label={label}
          digits={0}
          onCommit={(value) => editorActions.setBedRowAngle(bed.id, value)}
        />
        <button
          type="button"
          className={cx(controls.button, controls.small)}
          onClick={() => editorActions.turnBedRows(bed.id)}
        >
          <RotateCw size={14} aria-hidden="true" />
          {t('editor.beds.turnRows')}
        </button>
      </div>
      <p className={styles.hint}>{t('editor.beds.rowHint')}</p>
      <button
        type="button"
        className={cx(controls.button, controls.small)}
        onClick={() => useUiStore.getState().openVegCalendar(bed.id)}
      >
        <CalendarDays size={14} aria-hidden="true" />
        {t('editor.beds.vegCalendar')}
      </button>
    </>
  )
}
