import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { monthLong } from '../../../i18n/months'
import {
  type GrowthStop,
  type GrowthStopId,
  growthReferenceYear,
  growthStops,
} from '../../../model/growth'
import { type Brief, type LayerId, MONTHS } from '../../../model/schema'
import type { Proposal } from '../../../proposals/format'
import controls from '../../../styles/controls.module.css'
import { cx } from '../../../styles/cx'
import panels from '../panels/panels.module.css'
import { ViewerPlan } from '../../viewer/ViewerPlan'
import { viewerLayers, withLayerVisibility } from '../../viewer/viewerLayers'
import { growthViewOf, stepMonth } from '../view/plantView'
import type { GalleryEntry } from './galleryData'
import styles from './ideas.module.css'
import { Checklist, Figures, Report, StarButton } from './ProposalCard'
import { plantingYear } from './proposalSet'

const NO_SELECTION: ReadonlySet<string> = new Set()
const noop = () => {}

/** Keys in these fields belong to the field (a select's arrows change its value). */
function ownsArrowKeys(target: EventTarget | null): boolean {
  if (target instanceof HTMLInputElement) return target.type !== 'checkbox'
  return target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement
}

/**
 * One proposal large, read-only: the plan (pan and zoom) with its own layers, year and month,
 * and beside it the concept, figures, checklist and report. ←/→ step, Escape closes only this.
 */
export function ProposalPreview({
  entries,
  index,
  starred,
  brief,
  busy = false,
  onIndex,
  onStar,
  onUse,
  onMoreLike,
  onClose,
}: {
  entries: readonly GalleryEntry[]
  index: number
  starred: ReadonlySet<string>
  brief: Brief | undefined
  busy?: boolean
  onIndex: (index: number) => void
  onStar: (id: string) => void
  onUse: (proposal: Proposal) => void
  onMoreLike: (proposal: Proposal) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const entry = entries[index]!
  const { proposal } = entry
  const total = entries.length
  const step = (by: 1 | -1) => onIndex((index + by + total) % total)
  const [overrides, setOverrides] = useState<Partial<Record<LayerId, boolean>>>({})
  const [stop, setStop] = useState<GrowthStopId>('mature')
  const [month, setMonth] = useState<number | null>(null)
  const titleId = useId()
  const yearId = useId()
  const monthId = useId()
  const dialog = useRef<HTMLDivElement>(null)

  const shown = useMemo(
    () => withLayerVisibility(entry.expanded, overrides),
    [entry.expanded, overrides],
  )
  const year = growthViewOf(entry.expanded, stop, plantingYear())
  const view = useMemo(() => ({ year, month }), [year, month])
  const stops = growthStops(growthReferenceYear(entry.expanded, plantingYear()))
  const yearText = (s: GrowthStop) =>
    s.view === 'mature'
      ? t('editor.view.yearValue.mature')
      : s.offsetYears === 0
        ? t('editor.view.yearValue.planting', { year: s.view })
        : t('editor.view.yearValue.after', { year: s.view, count: s.offsetYears ?? 0 })

  // Keys are caught before the design ideas dialog sees them (capture), which then ignores
  // what was handled here (defaultPrevented).
  const keys = useRef({ step, onClose })
  useEffect(() => {
    keys.current = { step, onClose }
  })
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        keys.current.onClose()
      } else if (
        (event.key === 'ArrowLeft' || event.key === 'ArrowRight') &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !ownsArrowKeys(event.target)
      ) {
        event.preventDefault()
        keys.current.step(event.key === 'ArrowLeft' ? -1 : 1)
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])

  useEffect(() => dialog.current?.focus(), [])

  return (
    <div className={styles.previewBackdrop}>
      <div
        ref={dialog}
        className={styles.preview}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid="proposal-preview"
      >
        <div className={styles.previewHeader}>
          <h2 id={titleId}>{proposal.title}</h2>
          <button
            type="button"
            className={cx(controls.button, controls.small)}
            disabled={total < 2}
            onClick={() => step(-1)}
          >
            <ChevronLeft size={16} aria-hidden />
            {t('proposals.preview.previous')}
          </button>
          <span className={styles.status} data-testid="preview-position">
            {t('proposals.preview.position', { n: index + 1, total })}
          </span>
          <button
            type="button"
            className={cx(controls.button, controls.small)}
            disabled={total < 2}
            onClick={() => step(1)}
          >
            {t('proposals.preview.next')}
            <ChevronRight size={16} aria-hidden />
          </button>
          <StarButton
            title={proposal.title}
            starred={starred.has(proposal.id)}
            onStar={() => onStar(proposal.id)}
            className={styles.previewStar}
          />
          <button
            type="button"
            className={cx(controls.button, controls.small, controls.quiet)}
            aria-label={t('proposals.gallery.moreLikeNamed', { title: proposal.title })}
            onClick={() => onMoreLike(proposal)}
          >
            {t('proposals.gallery.moreLike')}
          </button>
          <button
            type="button"
            className={cx(controls.button, controls.small, controls.primary)}
            disabled={busy}
            aria-label={t('proposals.list.useNamed', { title: proposal.title })}
            onClick={() => onUse(proposal)}
          >
            {t('proposals.list.use')}
          </button>
          <button
            type="button"
            className={panels.iconButton}
            aria-label={t('proposals.preview.close')}
            onClick={onClose}
          >
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className={styles.previewBody}>
          <div className={styles.previewPlan}>
            <ViewerPlan
              key={proposal.id}
              project={shown}
              view={view}
              selection={NO_SELECTION}
              fitRequest={0}
              onTap={noop}
            />
          </div>
          <div className={styles.previewSide}>
            <fieldset>
              <legend>{t('proposals.preview.layers')}</legend>
              <div className={styles.previewLayers}>
                {viewerLayers(entry.expanded).map((id) => (
                  <label key={id} className={styles.check}>
                    <input
                      type="checkbox"
                      checked={shown.layers[id].visible}
                      onChange={(e) => setOverrides((o) => ({ ...o, [id]: e.target.checked }))}
                    />
                    {t(`editor.layers.names.${id}`)}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className={styles.row}>
              <label htmlFor={yearId}>{t('proposals.preview.year')}</label>
              <select
                id={yearId}
                className={controls.input}
                value={stop}
                onChange={(e) => setStop(e.target.value as GrowthStopId)}
              >
                {stops.map((s) => (
                  <option key={s.id} value={s.id}>
                    {yearText(s)}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.row}>
              <label htmlFor={monthId}>{t('proposals.preview.month')}</label>
              <button
                type="button"
                className={panels.iconButton}
                aria-label={t('editor.view.previousMonth')}
                onClick={() => setMonth(stepMonth(month, -1))}
              >
                <ChevronLeft size={16} aria-hidden />
              </button>
              <select
                id={monthId}
                className={controls.input}
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
                className={panels.iconButton}
                aria-label={t('editor.view.nextMonth')}
                onClick={() => setMonth(stepMonth(month, 1))}
              >
                <ChevronRight size={16} aria-hidden />
              </button>
            </div>
            {proposal.tags.length > 0 && (
              <ul className={styles.tags}>
                {proposal.tags.map((tag) => (
                  <li key={tag}>{tag}</li>
                ))}
              </ul>
            )}
            <p>{proposal.concept}</p>
            {proposal.highlights.length > 0 && (
              <ul className={styles.highlights}>
                {proposal.highlights.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            )}
            <Figures figures={entry.figures} />
            {entry.checklist.length > 0 && (
              <Checklist items={entry.checklist} project={entry.expanded} brief={brief} />
            )}
            <Report report={entry.report} />
          </div>
        </div>
      </div>
    </div>
  )
}
