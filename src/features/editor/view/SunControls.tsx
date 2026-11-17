import { Pause, Play, Sun } from 'lucide-react'
import { useEffect, useId } from 'react'
import { useTranslation } from 'react-i18next'
import { formatLocalDate, parseLocalDate } from '../../../geometry/sun'
import { formatNumber } from '../../../i18n/units'
import type { Project } from '../../../model/schema'
import { useUiStore } from '../../../store/uiStore'
import controls from '../../../styles/controls.module.css'
import { cx } from '../../../styles/cx'
import { editorActions } from '../actions'
import {
  QUICK_PICK_MONTHS,
  SUN_STEP_MIN,
  clampMoment,
  formatClock,
  playStep,
  quickPick,
  sunRange,
  useSunPosition,
} from './sunView'
import styles from './view.module.css'

/** Play: +10 min every 100 ms (a day in about 10 s). */
const PLAY_INTERVAL_MS = 100

/**
 * The sun's date and time (M11), at the right of the view bar: on/off, date, quick picks, a time
 * slider from sunrise to sunset, play and a readout. View state only: nothing here is undone or
 * saved.
 */
export function SunControls({ project }: { project: Project }) {
  const { t } = useTranslation()
  const sun = useUiStore((s) => s.sun)
  const playing = useUiStore((s) => s.sunPlaying)
  const position = useSunPosition(project)
  const dateId = useId()
  const timeId = useId()
  const { location } = project.settings
  const { setSun, setSunPlaying } = useUiStore.getState()
  const icon = { size: 16, 'aria-hidden': true } as const

  const date = sun?.date
  const minutes = sun?.minutes
  // Play: chained timeouts; each tick reads the current moment, so it ends at sunset.
  useEffect(() => {
    if (!playing || !date || minutes === undefined) return
    const range = sunRange(date, location)
    const next = playStep(minutes, range)
    if (next === null) {
      setSunPlaying(false)
      return
    }
    const id = setTimeout(() => setSun({ date, minutes: next }), PLAY_INTERVAL_MS)
    return () => clearTimeout(id)
  }, [playing, date, minutes, location, setSun, setSunPlaying])
  useEffect(() => {
    if (!sun) setSunPlaying(false)
  }, [sun, setSunPlaying])
  useEffect(() => () => setSunPlaying(false), [setSunPlaying])

  const toggle = (
    <button
      type="button"
      className={cx(controls.button, controls.small, controls.quiet, styles.sunToggle)}
      data-testid="sun-toggle"
      aria-pressed={sun !== null}
      title={t('editor.sun.toggleHint')}
      onClick={() => editorActions.setSunOn(sun === null)}
    >
      <Sun {...icon} />
      {t('editor.sun.toggle')}
    </button>
  )
  if (!sun) return <div className={styles.sunGroup}>{toggle}</div>

  const range = sunRange(sun.date, location)
  const set = (moment: typeof sun) => setSun(clampMoment(moment, location))
  const play = () => {
    if (playing) return setSunPlaying(false)
    if (sun.minutes >= range.max) setSun({ date: sun.date, minutes: range.min })
    setSunPlaying(true)
  }
  const clock = formatClock(sun.minutes)

  return (
    <div className={styles.sunGroup} role="group" aria-label={t('editor.sun.toggle')}>
      {toggle}
      <label className={styles.label} htmlFor={dateId}>
        {t('editor.sun.date')}
      </label>
      <input
        id={dateId}
        type="date"
        className={cx(controls.input, styles.date)}
        value={formatLocalDate(sun.date)}
        onChange={(e) => {
          const next = parseLocalDate(e.target.value)
          if (next) set({ date: next, minutes: sun.minutes })
        }}
      />
      <div className={styles.quickPicks} role="group" aria-label={t('editor.sun.quickPick')}>
        {QUICK_PICK_MONTHS.map((m) => (
          <button
            key={m}
            type="button"
            className={cx(controls.button, controls.small, controls.quiet)}
            onClick={() => set({ date: quickPick(sun.date.year, m), minutes: sun.minutes })}
          >
            {t(`editor.sun.quick.${m}`)}
          </button>
        ))}
      </div>
      <label className={styles.label} htmlFor={timeId}>
        {t('editor.sun.time')}
      </label>
      <input
        id={timeId}
        className={styles.slider}
        type="range"
        min={range.min}
        max={range.max}
        step={SUN_STEP_MIN}
        value={sun.minutes}
        aria-valuetext={clock}
        onChange={(e) => set({ date: sun.date, minutes: Number(e.target.value) })}
      />
      <span className={styles.value} data-testid="sun-time">
        {clock}
      </span>
      <button
        type="button"
        className={styles.stepButton}
        aria-label={playing ? t('editor.sun.pause') : t('editor.sun.play')}
        title={playing ? t('editor.sun.pause') : t('editor.sun.play')}
        onClick={play}
      >
        {playing ? <Pause {...icon} /> : <Play {...icon} />}
      </button>
      <span className={styles.readout} data-testid="sun-position">
        {position && position.altitudeDeg > 0
          ? t('editor.sun.position', {
              altitude: formatNumber(position.altitudeDeg, 0),
              azimuth: formatNumber(position.azimuthDeg, 0),
            })
          : t('editor.sun.down')}
      </span>
    </div>
  )
}
