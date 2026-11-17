import { Check, Minus, Star, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { currentLanguage } from '../../../i18n'
import { formatArea, formatNumber, formatPercent } from '../../../i18n/units'
import { findPlant, plantName } from '../../../model/plants'
import type { Brief, Project } from '../../../model/schema'
import type { ChecklistItem, ChecklistStatus } from '../../../proposals/checklist'
import type { DropReason, ExpansionReport } from '../../../proposals/expand'
import type { ProposalFigures } from '../../../proposals/figures'
import controls from '../../../styles/controls.module.css'
import { cx } from '../../../styles/cx'
import type { GalleryEntry } from './galleryData'
import styles from './ideas.module.css'
import { useThumbnail } from './thumbnails'

const REASONS: readonly DropReason[] = [
  'outside',
  'overlap',
  'unknownPlant',
  'fixed',
  'unknownRef',
  'tooSmall',
]

const STATUS_ICONS = { met: Check, partly: Minus, missing: X } as const

/** One proposal in the gallery: thumbnail, star, texts, key figures and the brief checklist. */
export function ProposalCard({
  entry,
  thumbKey,
  brief,
  starred,
  selected,
  disabled,
  onStar,
  onSelect,
  onPreview,
  onMoreLike,
  onDiscard,
  onUse,
}: {
  entry: GalleryEntry
  thumbKey: string
  brief: Brief | undefined
  starred: boolean
  selected: boolean
  disabled: boolean
  onStar: () => void
  onSelect: (selected: boolean) => void
  onPreview: () => void
  onMoreLike: () => void
  onDiscard: () => void
  onUse: () => void
}) {
  const { t } = useTranslation()
  const { proposal } = entry
  const thumb = useThumbnail(thumbKey, entry.expanded)

  return (
    <li className={cx(styles.card, selected && styles.selected)} data-testid="proposal">
      <div className={styles.thumbBox}>
        <button
          type="button"
          className={styles.thumbButton}
          aria-label={t('proposals.preview.open', { title: proposal.title })}
          onClick={onPreview}
        >
          {thumb ? (
            <img
              className={styles.thumb}
              src={thumb}
              alt=""
              data-testid="proposal-thumb"
              data-ready="true"
            />
          ) : (
            <span className={styles.thumb} data-testid="proposal-thumb" data-ready="false">
              {t('proposals.gallery.thumbLoading')}
            </span>
          )}
        </button>
        <input
          type="checkbox"
          className={styles.select}
          checked={selected}
          aria-label={t('proposals.gallery.select', { title: proposal.title })}
          onChange={(e) => onSelect(e.target.checked)}
        />
        <StarButton title={proposal.title} starred={starred} onStar={onStar} />
      </div>
      <h3>{proposal.title}</h3>
      {proposal.tags.length > 0 && (
        <ul className={styles.tags}>
          {proposal.tags.map((tag) => (
            <li key={tag}>{tag}</li>
          ))}
        </ul>
      )}
      <p className={styles.concept}>{proposal.concept}</p>
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
      <div className={styles.cardActions}>
        <button
          type="button"
          className={cx(controls.button, controls.small, controls.quiet)}
          aria-label={t('proposals.gallery.moreLikeNamed', { title: proposal.title })}
          onClick={onMoreLike}
        >
          {t('proposals.gallery.moreLike')}
        </button>
        <button
          type="button"
          className={cx(controls.button, controls.small, controls.quiet)}
          aria-label={t('proposals.gallery.discardNamed', { title: proposal.title })}
          disabled={disabled}
          onClick={onDiscard}
        >
          {t('proposals.gallery.discard')}
        </button>
      </div>
      <button
        type="button"
        className={cx(controls.button, controls.primary, controls.small, styles.use)}
        disabled={disabled}
        aria-label={t('proposals.list.useNamed', { title: proposal.title })}
        onClick={onUse}
      >
        {t('proposals.list.use')}
      </button>
    </li>
  )
}

/** The star toggle of a proposal (card and preview). */
export function StarButton({
  title,
  starred,
  onStar,
  className = styles.star,
}: {
  title: string
  starred: boolean
  onStar: () => void
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      className={cx(className, starred && styles.starOn)}
      aria-pressed={starred}
      aria-label={t('proposals.gallery.star', { title })}
      title={t(starred ? 'proposals.gallery.unstar' : 'proposals.gallery.star', { title })}
      onClick={onStar}
    >
      <Star size={18} aria-hidden fill={starred ? 'currentColor' : 'none'} />
    </button>
  )
}

/** What expanding the proposal added and dropped. */
export function Report({ report }: { report: ExpansionReport }) {
  const { t } = useTranslation()
  const dropped = REASONS.map((reason) => ({
    reason,
    count: report.dropped.filter((d) => d.reason === reason).length,
  })).filter((d) => d.count > 0)
  return (
    <>
      <p className={styles.meta}>
        {t('proposals.list.counts', {
          objects: report.objects,
          plantings: report.plantings,
          species: report.species,
        })}
      </p>
      {(dropped.length > 0 || report.matched.length > 0) && (
        <p className={styles.meta}>
          {[
            ...dropped.map((d) => t(`proposals.report.${d.reason}`, { count: d.count })),
            ...(report.matched.length > 0
              ? [t('proposals.report.matched', { count: report.matched.length })]
              : []),
          ].join(' · ')}
        </p>
      )}
    </>
  )
}

const share = (value: number | null) => (value === null ? '–' : formatPercent(value))

/** The proposal's key figures as a definition list. */
export function Figures({ figures }: { figures: ProposalFigures }) {
  const { t } = useTranslation()
  const rows = [
    ['paved', formatArea(figures.pavedM2, 0)],
    ['lawn', formatArea(figures.lawnM2, 0)],
    ['planted', formatArea(figures.plantedM2, 0)],
    ['plants', String(figures.plants)],
    ['species', String(figures.species)],
    ['native', share(figures.nativeShare)],
    ['bloom', String(figures.bloomMonths)],
    ['evergreen', share(figures.evergreenShare)],
    ['warnings', String(figures.warnings)],
  ] as const
  return (
    <dl className={styles.figures} data-testid="proposal-figures">
      {rows.map(([key, value]) => (
        <div key={key}>
          <dt>{t(`proposals.figures.${key}`)}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** The brief checklist as chips: a status icon and what was checked. */
export function Checklist({
  items,
  project,
  brief,
}: {
  items: ChecklistItem[]
  project: Project
  brief: Brief | undefined
}) {
  const { t } = useTranslation()
  const lang = currentLanguage()
  const plant = (id: string) => {
    const found = findPlant(project, id)
    return found ? plantName(found, lang) : id
  }
  const status = (s: ChecklistStatus) => t(`proposals.checklist.${s}`)

  function text(item: ChecklistItem): string {
    switch (item.type) {
      case 'mustHave': {
        const parts = [
          t(
            `proposals.brief.mustHaves.kinds.${item.subject}` as 'proposals.brief.mustHaves.kinds.pond',
          ),
        ]
        if (item.wanted !== undefined && item.found !== undefined) {
          const unit = (v: number) => (item.unit === 'm2' ? formatArea(v, 0) : formatNumber(v, 0))
          parts.push(
            t('proposals.checklist.found', { found: unit(item.found), wanted: unit(item.wanted) }),
          )
        }
        const place = brief?.mustHaves.find((m) => m.id === item.id)?.place?.trim()
        if (place && item.place === 'missed')
          parts.push(t('proposals.checklist.placeMissed', { place }))
        if (place && item.place === 'unchecked')
          parts.push(t('proposals.checklist.placeUnchecked', { place }))
        return parts.join(' · ')
      }
      case 'screening':
        return `${t('proposals.checklist.screening', { edge: item.subject })} · ${formatPercent(item.coverage ?? 0)}`
      case 'include':
        return t('proposals.checklist.include', { plant: plant(item.subject) })
      case 'avoid':
        return t('proposals.checklist.avoid', { plant: plant(item.subject) })
      case 'toxic':
        return t('proposals.checklist.toxic')
    }
  }

  return (
    <ul
      className={styles.checklist}
      data-testid="proposal-checklist"
      aria-label={t('proposals.checklist.title')}
    >
      {items.map((item) => {
        const Icon = STATUS_ICONS[item.status]
        return (
          <li key={item.id} className={styles[item.status]} data-status={item.status}>
            <Icon size={14} aria-hidden />
            <span className={controls.visuallyHidden}>{status(item.status)}: </span>
            {text(item)}
          </li>
        )
      })}
    </ul>
  )
}
