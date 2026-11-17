import { X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  PNG_FACTORS,
  type PngFactor,
  designBounds,
  pdfDefaults,
  pngSize,
  tooManyPixels,
} from '../../../export/exportOptions'
import {
  type Orientation,
  ORIENTATIONS,
  PAPER_SIZES,
  type PaperSize,
  PRINT_SCALES,
  type PrintScale,
  bestOrientation,
  bestScale,
  boundsSizeM,
  fitsAtScale,
  planAreaM,
} from '../../../export/scale'
import { formatLength } from '../../../i18n/units'
import { useProjectStore } from '../../../store/projectStore'
import { useUiStore } from '../../../store/uiStore'
import controls from '../../../styles/controls.module.css'
import { cx } from '../../../styles/cx'
import panels from '../panels/panels.module.css'
import styles from './export.module.css'
import { runExport } from './runExport'

/** Saves the plan as a PDF for printing or as an image. */
export function ExportDialog() {
  const open = useUiStore((s) => s.exportOpen)
  const hasProject = useProjectStore((s) => !!s.project)
  if (!open || !hasProject) return null
  return <ExportForm />
}

function ExportForm() {
  const { t } = useTranslation()
  const canvasSize = useUiStore((s) => s.canvasSize) ?? { width: 0, height: 0 }
  const close = () => useUiStore.getState().setExportOpen(false)
  const project = useProjectStore.getState().project!
  const size = boundsSizeM(designBounds(project))
  const initial = pdfDefaults(designBounds(project), 'A4')
  const [format, setFormat] = useState<'pdf' | 'png'>('pdf')
  const [paper, setPaper] = useState<PaperSize>('A4')
  const [orientation, setOrientation] = useState<Orientation>(initial.orientation)
  const [scale, setScale] = useState<PrintScale>(initial.scale)
  const suggestedScale = bestScale(size, paper, orientation) ?? 200
  const fits = fitsAtScale(size, paper, orientation, scale)
  const paperId = useId()
  const orientationId = useId()
  const scaleId = useId()
  const [area, setArea] = useState<'plan' | 'view'>('plan')
  const [factor, setFactor] = useState<PngFactor>(() =>
    tooManyPixels(pngSize(canvasSize, 2)) ? 1 : 2,
  )
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const titleId = useId()
  const sizeId = useId()
  const first = useRef<HTMLInputElement>(null)

  useEffect(() => {
    first.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const sizes = PNG_FACTORS.map((f) => ({ factor: f, size: pngSize(canvasSize, f) }))
  const anyTooBig = sizes.some(({ size }) => tooManyPixels(size))

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setFailed(false)
    try {
      await runExport(
        format === 'pdf' ? { format, paper, orientation, scale } : { format, area, factor },
      )
      close()
    } catch (error) {
      console.warn('Export failed', error)
      setFailed(true)
      setBusy(false)
    }
  }

  return (
    <div className={panels.backdrop} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <form
        className={cx(panels.dialog, panels.dialogNarrow)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={submit}
        aria-busy={busy}
      >
        <div className={panels.dialogHeader}>
          <h2 id={titleId} className={panels.dialogTitle}>
            {t('editor.export.title')}
          </h2>
          <button
            type="button"
            className={panels.iconButton}
            aria-label={t('editor.export.cancel')}
            onClick={close}
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <fieldset className={styles.choices} disabled={busy}>
          <legend>{t('editor.export.format')}</legend>
          <label>
            <input
              ref={first}
              type="radio"
              name="export-format"
              checked={format === 'pdf'}
              onChange={() => setFormat('pdf')}
            />
            {t('editor.export.pdf')}
          </label>
          <label>
            <input
              type="radio"
              name="export-format"
              checked={format === 'png'}
              onChange={() => setFormat('png')}
            />
            {t('editor.export.png')}
          </label>
        </fieldset>

        {format === 'pdf' ? (
          <>
            <label className={controls.label} htmlFor={paperId}>
              {t('editor.export.paper')}
            </label>
            <select
              id={paperId}
              className={cx(controls.input, panels.field)}
              value={paper}
              disabled={busy}
              onChange={(e) => {
                const next = e.target.value as PaperSize
                const nextOrientation = bestOrientation(size, next)
                setPaper(next)
                setOrientation(nextOrientation)
                setScale(bestScale(size, next, nextOrientation) ?? 200)
              }}
            >
              {PAPER_SIZES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <label className={controls.label} htmlFor={orientationId}>
              {t('editor.export.orientation')}
            </label>
            <select
              id={orientationId}
              className={cx(controls.input, panels.field)}
              value={orientation}
              disabled={busy}
              onChange={(e) => {
                const next = e.target.value as Orientation
                setOrientation(next)
                setScale(bestScale(size, paper, next) ?? 200)
              }}
            >
              {ORIENTATIONS.map((o) => (
                <option key={o} value={o}>
                  {t(`editor.export.${o}`)}
                </option>
              ))}
            </select>
            <label className={controls.label} htmlFor={scaleId}>
              {t('editor.export.scale')}
            </label>
            <select
              id={scaleId}
              className={cx(controls.input, panels.field)}
              value={scale}
              disabled={busy}
              onChange={(e) => setScale(Number(e.target.value) as PrintScale)}
            >
              {PRINT_SCALES.map((sc) => {
                const label = t('editor.export.scaleOption', { scale: sc })
                return (
                  <option key={sc} value={sc}>
                    {sc === suggestedScale
                      ? t('editor.export.suggested', { option: label })
                      : label}
                  </option>
                )
              })}
            </select>
            {!fits && (
              <p className={panels.warning} role="alert">
                {t('editor.export.notFit', {
                  width: formatLength(size.widthM, 1),
                  height: formatLength(size.heightM, 1),
                  scale,
                  areaWidth: formatLength(planAreaM(paper, orientation, scale).widthM, 1),
                  areaHeight: formatLength(planAreaM(paper, orientation, scale).heightM, 1),
                })}
              </p>
            )}
            <p className={panels.smallHint}>{t('editor.export.pages')}</p>
          </>
        ) : (
          <>
            <fieldset className={styles.choices} disabled={busy}>
              <legend>{t('editor.export.area')}</legend>
              <label>
                <input
                  type="radio"
                  name="export-area"
                  checked={area === 'plan'}
                  onChange={() => setArea('plan')}
                />
                {t('editor.export.areaPlan')}
              </label>
              <label>
                <input
                  type="radio"
                  name="export-area"
                  checked={area === 'view'}
                  onChange={() => setArea('view')}
                />
                {t('editor.export.areaView')}
              </label>
            </fieldset>

            <label className={controls.label} htmlFor={sizeId}>
              {t('editor.export.size')}
            </label>
            <select
              id={sizeId}
              className={cx(controls.input, panels.field)}
              value={factor}
              disabled={busy}
              onChange={(e) => setFactor(Number(e.target.value) as PngFactor)}
            >
              {sizes.map(({ factor: f, size }) => (
                <option key={f} value={f} disabled={tooManyPixels(size)}>
                  {t('editor.export.sizeOption', {
                    factor: f,
                    width: size.widthPx,
                    height: size.heightPx,
                  })}
                </option>
              ))}
            </select>
            {anyTooBig && <p className={panels.smallHint}>{t('editor.export.tooBig')}</p>}
          </>
        )}

        {failed && (
          <p className={panels.warning} role="alert">
            {t('editor.export.failed')}
          </p>
        )}

        <div className={panels.dialogActions}>
          <button type="button" className={cx(controls.button, controls.quiet)} onClick={close}>
            {t('editor.export.cancel')}
          </button>
          <button type="submit" className={cx(controls.button, controls.primary)} disabled={busy}>
            {busy ? t('editor.export.exporting') : t('editor.export.export')}
          </button>
        </div>
      </form>
    </div>
  )
}
