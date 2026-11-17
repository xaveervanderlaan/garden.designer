import { X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDecimal, parseNumber } from '../../../i18n/units'
import { normaliseName } from '../../../model/defaults'
import { PROJECT_NAME_MAX_LENGTH, SOIL_TYPES, type SoilType } from '../../../model/schema'
import { useProjectStore } from '../../../store/projectStore'
import { useUiStore } from '../../../store/uiStore'
import controls from '../../../styles/controls.module.css'
import { cx } from '../../../styles/cx'
import { editorActions } from '../actions'
import { normaliseAngle } from '../view/sunView'
import styles from './panels.module.css'

const MIN_GRID_M = 0.01
const MAX_GRID_M = 100

/** The design's settings: name, soil, grid size and when plants count as overlapping. */
export function SettingsDialog() {
  const open = useUiStore((s) => s.settingsOpen)
  const hasProject = useProjectStore((s) => !!s.project)
  if (!open || !hasProject) return null
  return <SettingsForm />
}

type Errors = {
  name?: boolean
  grid?: boolean
  overlap?: boolean
  lat?: boolean
  lng?: boolean
  north?: boolean
}

function SettingsForm() {
  const { t } = useTranslation()
  const project = useProjectStore((s) => s.project)!
  const close = () => useUiStore.getState().setSettingsOpen(false)
  const [name, setName] = useState(project.name)
  const [soil, setSoil] = useState<SoilType>(project.settings.soil)
  const [grid, setGrid] = useState(() => formatDecimal(project.settings.gridSizeM, 3))
  const [overlap, setOverlap] = useState(() =>
    formatDecimal(project.settings.overlapThreshold * 100, 1),
  )
  const [lat, setLat] = useState(() => formatDecimal(project.settings.location.lat, 4))
  const [lng, setLng] = useState(() => formatDecimal(project.settings.location.lng, 4))
  const [north, setNorth] = useState(() => formatDecimal(project.settings.northAngleDeg, 0))
  const [errors, setErrors] = useState<Errors>({})
  const titleId = useId()
  const nameId = useId()
  const soilId = useId()
  const gridId = useId()
  const overlapId = useId()
  const latId = useId()
  const lngId = useId()
  const northId = useId()
  const firstInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    firstInput.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const cleanName = normaliseName(name)
    const gridM = parseNumber(grid)
    const overlapPercent = parseNumber(overlap)
    const latDeg = parseNumber(lat)
    const lngDeg = parseNumber(lng)
    const northDeg = parseNumber(north)
    const next: Errors = {
      name: !cleanName,
      grid: gridM === undefined || gridM < MIN_GRID_M || gridM > MAX_GRID_M,
      overlap: overlapPercent === undefined || overlapPercent < 0 || overlapPercent > 100,
      lat: latDeg === undefined || latDeg < -90 || latDeg > 90,
      lng: lngDeg === undefined || lngDeg < -180 || lngDeg > 180,
      north: northDeg === undefined,
    }
    if (Object.values(next).some(Boolean)) {
      setErrors(next)
      return
    }
    close()
    editorActions.saveSettings(cleanName, {
      ...project.settings,
      soil,
      gridSizeM: gridM!,
      overlapThreshold: Math.round(overlapPercent! * 10) / 1000,
      location: { lat: latDeg!, lng: lngDeg! },
      northAngleDeg: normaliseAngle(northDeg!),
    })
  }

  return (
    <div className={styles.backdrop} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <form
        className={cx(styles.dialog, styles.dialogNarrow)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={submit}
        noValidate
      >
        <div className={styles.dialogHeader}>
          <h2 id={titleId} className={styles.dialogTitle}>
            {t('editor.settings.title')}
          </h2>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={t('common.cancel')}
            onClick={close}
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <label className={controls.label} htmlFor={nameId}>
          {t('editor.settings.name')}
        </label>
        <input
          ref={firstInput}
          id={nameId}
          className={cx(controls.input, styles.field)}
          value={name}
          maxLength={PROJECT_NAME_MAX_LENGTH}
          aria-invalid={!!errors.name}
          onChange={(e) => {
            setName(e.target.value)
            setErrors({ ...errors, name: false })
          }}
        />
        {errors.name && (
          <p className={cx(controls.fieldError, styles.fieldErrorTight)} role="alert">
            {t('editor.settings.nameRequired')}
          </p>
        )}

        <label className={controls.label} htmlFor={soilId}>
          {t('editor.settings.soil')}
        </label>
        <select
          id={soilId}
          className={cx(controls.input, styles.field)}
          value={soil}
          onChange={(e) => setSoil(e.target.value as SoilType)}
        >
          {SOIL_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`plants.soil.${type}`)}
            </option>
          ))}
        </select>
        <p className={cx(styles.smallHint, styles.fieldHint)}>{t('editor.settings.soilHint')}</p>

        <div className={styles.fieldRow}>
          <div>
            <label className={controls.label} htmlFor={gridId}>
              {t('editor.settings.grid')}
            </label>
            <input
              id={gridId}
              className={cx(controls.input, styles.field)}
              inputMode="decimal"
              value={grid}
              aria-invalid={!!errors.grid}
              onChange={(e) => {
                setGrid(e.target.value)
                setErrors({ ...errors, grid: false })
              }}
            />
          </div>
          <div>
            <label className={controls.label} htmlFor={overlapId}>
              {t('editor.settings.overlap')}
            </label>
            <input
              id={overlapId}
              className={cx(controls.input, styles.field)}
              inputMode="decimal"
              value={overlap}
              aria-invalid={!!errors.overlap}
              onChange={(e) => {
                setOverlap(e.target.value)
                setErrors({ ...errors, overlap: false })
              }}
            />
          </div>
        </div>
        {errors.grid && (
          <p className={cx(controls.fieldError, styles.fieldErrorTight)} role="alert">
            {t('editor.settings.invalidGrid')}
          </p>
        )}
        {errors.overlap && (
          <p className={cx(controls.fieldError, styles.fieldErrorTight)} role="alert">
            {t('editor.settings.invalidOverlap')}
          </p>
        )}
        <p className={styles.smallHint}>{t('editor.settings.overlapHint')}</p>

        <div className={styles.fieldRow}>
          <div>
            <label className={controls.label} htmlFor={latId}>
              {t('editor.settings.latitude')}
            </label>
            <input
              id={latId}
              className={cx(controls.input, styles.field)}
              inputMode="decimal"
              value={lat}
              aria-invalid={!!errors.lat}
              onChange={(e) => {
                setLat(e.target.value)
                setErrors({ ...errors, lat: false })
              }}
            />
          </div>
          <div>
            <label className={controls.label} htmlFor={lngId}>
              {t('editor.settings.longitude')}
            </label>
            <input
              id={lngId}
              className={cx(controls.input, styles.field)}
              inputMode="decimal"
              value={lng}
              aria-invalid={!!errors.lng}
              onChange={(e) => {
                setLng(e.target.value)
                setErrors({ ...errors, lng: false })
              }}
            />
          </div>
          <div>
            <label className={controls.label} htmlFor={northId}>
              {t('editor.settings.northAngle')}
            </label>
            <input
              id={northId}
              className={cx(controls.input, styles.field)}
              inputMode="decimal"
              value={north}
              aria-invalid={!!errors.north}
              onChange={(e) => {
                setNorth(e.target.value)
                setErrors({ ...errors, north: false })
              }}
            />
          </div>
        </div>
        {errors.lat && (
          <p className={cx(controls.fieldError, styles.fieldErrorTight)} role="alert">
            {t('editor.settings.latitudeError')}
          </p>
        )}
        {errors.lng && (
          <p className={cx(controls.fieldError, styles.fieldErrorTight)} role="alert">
            {t('editor.settings.longitudeError')}
          </p>
        )}
        {errors.north && (
          <p className={cx(controls.fieldError, styles.fieldErrorTight)} role="alert">
            {t('editor.settings.northError')}
          </p>
        )}
        <p className={styles.smallHint}>{t('editor.settings.locationHint')}</p>
        <p className={styles.smallHint}>{t('editor.settings.northHint')}</p>

        <div className={styles.dialogActions}>
          <button type="button" className={cx(controls.button, controls.quiet)} onClick={close}>
            {t('common.cancel')}
          </button>
          <button type="submit" className={cx(controls.button, controls.primary)}>
            {t('common.save')}
          </button>
        </div>
      </form>
    </div>
  )
}
