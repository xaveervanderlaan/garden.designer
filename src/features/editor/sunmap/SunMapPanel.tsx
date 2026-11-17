import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatLocalDate, parseLocalDate, type LocalDate } from '../../../geometry/sun'
import { classifyGrid, SUN_LEVEL_ORDER } from '../../../geometry/sunHours'
import { hasPlot } from '../../../model/plot'
import type { Project } from '../../../model/schema'
import { useSunMapStore } from '../../../store/sunMapStore'
import { useUiStore } from '../../../store/uiStore'
import { SUN_MAP_STYLE } from '../../../styles/elementStyles'
import { formatLength, formatNumber } from '../../../i18n/units'
import { CollapsibleSection } from '../panels/CollapsibleSection'
import styles from '../panels/panels.module.css'
import { usePlantView } from '../view/plantView'
import { cancelSunMap, clearSunMap, computeSunMap, setSunMapVisible } from './sunMapActions'
import {
  levelShares,
  SUN_MAP_CELL_SIZES,
  sunMapInput,
  sunMapKey,
  type SunMapRequest,
} from './sunMap'

type Mode = 'season' | 'date'

/** Computes the sun-hours map in the worker and explains it (legend, shares); see SunMapLayer. */
export function SunMapPanel({ project }: { project: Project }) {
  const { t } = useTranslation()
  const view = usePlantView(project)
  const sun = useUiStore((s) => s.sun)
  const status = useSunMapStore((s) => s.status)
  const progress = useSunMapStore((s) => s.progress)
  const result = useSunMapStore((s) => s.result)
  const key = useSunMapStore((s) => s.key)
  const visible = useSunMapStore((s) => s.visible)
  const error = useSunMapStore((s) => s.error)

  const thisYear = sun?.date.year ?? new Date().getFullYear()
  const [mode, setMode] = useState<Mode>('season')
  const [date, setDate] = useState<LocalDate>(
    () => sun?.date ?? { year: thisYear, month: 6, day: 21 },
  )
  const [cellM, setCellM] = useState<number>(0.5)

  const request: SunMapRequest = {
    day: mode === 'season' ? { kind: 'season', year: thisYear } : { kind: 'date', date },
    cellM,
    year: view.year,
  }
  const plot = hasPlot(project)
  const running = status === 'running'
  const stale = useMemo(() => {
    if (!result || key === null) return false
    const input = sunMapInput(project, request)
    return !input || sunMapKey(input) !== key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, result, key, mode, date, cellM, view.year, thisYear])

  const thresholds = project.settings.sunThresholds
  const shares = useMemo(
    () => (result ? levelShares(classifyGrid(result, thresholds)) : null),
    [result, thresholds],
  )
  const range = (level: (typeof SUN_LEVEL_ORDER)[number]) => {
    const f = (n: number) => formatNumber(n, 1)
    if (level === 'full-sun')
      return t('editor.sunMap.range.full', { hours: f(thresholds.fullSunHours) })
    if (level === 'part-shade')
      return t('editor.sunMap.range.part', {
        from: f(thresholds.partShadeHours),
        to: f(thresholds.fullSunHours),
      })
    return t('editor.sunMap.range.shade', { hours: f(thresholds.partShadeHours) })
  }

  return (
    <CollapsibleSection title={t('editor.sunMap.title')} defaultOpen={false}>
      <div data-testid="sun-map-panel">
        {!plot && <p className={styles.hint}>{t('editor.sunMap.noPlot')}</p>}
        <fieldset disabled={running}>
          <legend>{t('editor.sunMap.day')}</legend>
          <label>
            <input
              type="radio"
              name="sun-map-day"
              checked={mode === 'season'}
              onChange={() => setMode('season')}
            />{' '}
            {t('editor.sunMap.season')}
          </label>
          <label>
            <input
              type="radio"
              name="sun-map-day"
              checked={mode === 'date'}
              onChange={() => setMode('date')}
            />{' '}
            {t('editor.sunMap.oneDay')}
          </label>
          {mode === 'date' && (
            <input
              type="date"
              aria-label={t('editor.sunMap.date')}
              value={formatLocalDate(date)}
              onChange={(e) => {
                const next = parseLocalDate(e.target.value)
                if (next) setDate(next)
              }}
            />
          )}
        </fieldset>
        <label>
          {t('editor.sunMap.cellSize')}{' '}
          <select
            value={cellM}
            disabled={running}
            onChange={(e) => setCellM(Number(e.target.value))}
          >
            {SUN_MAP_CELL_SIZES.map((size) => (
              <option key={size} value={size}>
                {formatLength(size)}
              </option>
            ))}
          </select>
        </label>
        <div>
          {running ? (
            <>
              <progress
                data-testid="sun-map-progress"
                value={progress}
                max={1}
                aria-label={t('editor.sunMap.computing')}
              />
              <button type="button" data-testid="sun-map-cancel" onClick={cancelSunMap}>
                {t('editor.sunMap.cancel')}
              </button>
            </>
          ) : (
            <button
              type="button"
              data-testid="sun-map-compute"
              disabled={!plot}
              onClick={() => void computeSunMap(project, request)}
            >
              {result ? t('editor.sunMap.recompute') : t('editor.sunMap.compute')}
            </button>
          )}
        </div>
        {status === 'error' && (
          <p role="alert" className={styles.hint}>
            {t('editor.sunMap.failed')} {error}
          </p>
        )}
        {stale && (
          <p className={styles.hint} data-testid="sun-map-stale">
            {t('editor.sunMap.stale')}
          </p>
        )}
        {result && shares && (
          <>
            <ul className={styles.rowList} aria-label={t('editor.sunMap.share')}>
              {SUN_LEVEL_ORDER.map((level) => (
                <li key={level}>
                  <span
                    aria-hidden
                    style={{
                      display: 'inline-block',
                      width: 14,
                      height: 14,
                      marginRight: 6,
                      background: SUN_MAP_STYLE.colors[level],
                      opacity: SUN_MAP_STYLE.opacity + 0.2,
                    }}
                  />
                  {t(`plants.sun.${level}`)} ({range(level)}){' '}
                  <span data-testid={`sun-share-${level}`}>
                    {formatNumber(Math.round(shares[level] * 100), 0)}%
                  </span>
                </li>
              ))}
            </ul>
            <p className={styles.hint}>
              {t('editor.sunMap.daylight')}: {`${formatNumber(result.daylightHours, 1)}\u00a0h`}
            </p>
            <label>
              <input
                type="checkbox"
                checked={visible}
                onChange={(e) => setSunMapVisible(e.target.checked)}
              />{' '}
              {t('editor.sunMap.show')}
            </label>{' '}
            <button type="button" onClick={clearSunMap}>
              {t('editor.sunMap.clear')}
            </button>
          </>
        )}
      </div>
    </CollapsibleSection>
  )
}
