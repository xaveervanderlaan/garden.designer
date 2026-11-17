import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Project } from '../../../model/schema'
import type { ProposalSetRecord } from '../../../persistence/proposalSets'
import { FIGURE_KEYS, type FigureKey, compareByFigure } from '../../../proposals/figures'
import type { Proposal } from '../../../proposals/format'
import controls from '../../../styles/controls.module.css'
import { cx } from '../../../styles/cx'
import panels from '../panels/panels.module.css'
import type { FollowUpRequest } from '../../../proposals/followUp'
import { applyProposal, applyProposals } from './applyProposal'
import { useGalleryEntries } from './galleryData'
import styles from './ideas.module.css'
import { ProposalCard } from './ProposalCard'
import { ProposalPreview } from './ProposalPreview'
import { MORE_LIKE_DEFAULT, discardProposals, nowMs, plantingYear, toggleStar } from './proposalSet'
import { thumbnailKey } from './thumbnails'

type SortKey = 'order' | FigureKey
const SORT_KEYS: readonly SortKey[] = ['order', ...FIGURE_KEYS]

/**
 * The proposals of a set side by side: thumbnail, figures and brief checklist per card, sorted by
 * a figure or filtered to the starred ones. Stars are saved with the set.
 */
export function ProposalGallery({
  project,
  set,
  onSetChange,
  onFollowUp,
}: {
  project: Project
  set: ProposalSetRecord
  onSetChange: (next: ProposalSetRecord) => void
  /** Asks for a follow-up prompt (shown above the paste box). */
  onFollowUp: (request: FollowUpRequest) => void
}) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [sort, setSort] = useState<SortKey>('order')
  const [starredOnly, setStarredOnly] = useState(false)
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  /** The open preview: the cards' order when it opened, and the proposal shown. */
  const [preview, setPreview] = useState<{ ids: string[]; id: string } | null>(null)
  const sortId = useId()
  const year = plantingYear()
  const entries = useGalleryEntries(project, set.proposals, year)
  const starred = useMemo(() => new Set(set.starred ?? []), [set.starred])
  const shown = useMemo(() => {
    const list = starredOnly ? entries.filter((e) => starred.has(e.proposal.id)) : entries
    if (sort === 'order') return list
    const compare = compareByFigure(sort)
    return [...list].sort((a, b) => compare(a.figures, b.figures))
  }, [entries, sort, starredOnly, starred])
  // Only proposals still in the set count as selected (others may have been discarded).
  const selected = useMemo(
    () => set.proposals.filter((p) => picked.has(p.id)),
    [set.proposals, picked],
  )
  const previewEntries = useMemo(() => {
    if (!preview) return []
    const byId = new Map(entries.map((e) => [e.proposal.id, e]))
    return preview.ids.flatMap((id) => byId.get(id) ?? [])
  }, [preview, entries])
  const previewIndex = previewEntries.findIndex((e) => e.proposal.id === preview?.id)

  if (set.proposals.length === 0) {
    return <p className={panels.smallHint}>{t('proposals.list.empty')}</p>
  }

  async function use(proposals: Proposal[]) {
    setBusy(true)
    setFailed(false)
    try {
      if (proposals.length === 1) await applyProposal(proposals[0]!)
      else await applyProposals(proposals)
    } catch (error) {
      console.warn('Using the proposal failed', error)
      setFailed(true)
      setBusy(false)
    }
  }

  const select = (id: string, on: boolean) =>
    setPicked((current) => {
      const next = new Set(current)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  const discard = (ids: string[]) => {
    onSetChange(discardProposals(set, ids, nowMs()))
    setPicked((current) => new Set([...current].filter((id) => !ids.includes(id))))
  }
  const moreLike = (proposal: Proposal) => {
    setPreview(null)
    onFollowUp({
      kind: 'moreLike',
      proposal,
      count: MORE_LIKE_DEFAULT,
      usedIds: set.proposals.map((p) => p.id),
    })
  }
  const regenerate = () =>
    onFollowUp({
      kind: 'regenerate',
      proposals: selected,
      keep: set.proposals.filter((p) => !picked.has(p.id)),
    })

  return (
    <>
      <div className={styles.galleryBar}>
        <label htmlFor={sortId}>{t('proposals.gallery.sort')}</label>
        <select
          id={sortId}
          className={controls.input}
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
        >
          {SORT_KEYS.map((key) => (
            <option key={key} value={key}>
              {t(`proposals.gallery.sortBy.${key}`)}
            </option>
          ))}
        </select>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={starredOnly}
            onChange={(e) => setStarredOnly(e.target.checked)}
          />
          {t('proposals.gallery.starredOnly')}
        </label>
        <button
          type="button"
          className={cx(controls.button, controls.small, controls.primary)}
          disabled={busy || selected.length === 0}
          onClick={() => void use(selected)}
        >
          {t('proposals.gallery.useSelected', { count: selected.length })}
        </button>
        <button
          type="button"
          className={cx(controls.button, controls.small)}
          disabled={selected.length === 0}
          onClick={regenerate}
        >
          {t('proposals.gallery.regenerateSelected')}
        </button>
        <button
          type="button"
          className={cx(controls.button, controls.small, controls.quiet)}
          disabled={busy || selected.length === 0}
          onClick={() => discard(selected.map((p) => p.id))}
        >
          {t('proposals.gallery.discardSelected')}
        </button>
      </div>
      {failed && (
        <p className={panels.warning} role="alert">
          {t('proposals.list.failed')}
        </p>
      )}
      {shown.length === 0 && (
        <p className={panels.smallHint}>{t('proposals.gallery.noneStarred')}</p>
      )}
      <ul className={cx(styles.cards, styles.gallery)} data-testid="proposal-list" aria-busy={busy}>
        {shown.map((entry) => (
          <ProposalCard
            key={entry.proposal.id}
            entry={entry}
            thumbKey={thumbnailKey(project, entry.proposal)}
            brief={project.brief}
            starred={starred.has(entry.proposal.id)}
            selected={picked.has(entry.proposal.id)}
            disabled={busy}
            onStar={() => onSetChange(toggleStar(set, entry.proposal.id, nowMs()))}
            onSelect={(on) => select(entry.proposal.id, on)}
            onPreview={() =>
              setPreview({ ids: shown.map((e) => e.proposal.id), id: entry.proposal.id })
            }
            onMoreLike={() => moreLike(entry.proposal)}
            onDiscard={() => discard([entry.proposal.id])}
            onUse={() => void use([entry.proposal])}
          />
        ))}
      </ul>
      {preview && previewIndex >= 0 && (
        <ProposalPreview
          entries={previewEntries}
          index={previewIndex}
          starred={starred}
          brief={project.brief}
          busy={busy}
          onIndex={(i) => setPreview({ ...preview, id: previewEntries[i]!.proposal.id })}
          onStar={(id) => onSetChange(toggleStar(set, id, nowMs()))}
          onUse={(proposal) => void use([proposal])}
          onMoreLike={moreLike}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  )
}
