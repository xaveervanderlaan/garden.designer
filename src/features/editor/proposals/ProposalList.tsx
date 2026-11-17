import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Project } from '../../../model/schema'
import { type DropReason, expandProposal } from '../../../proposals/expand'
import type { Proposal } from '../../../proposals/format'
import controls from '../../../styles/controls.module.css'
import { cx } from '../../../styles/cx'
import panels from '../panels/panels.module.css'
import { applyProposal } from './applyProposal'
import styles from './ideas.module.css'
import { plantingYear } from './proposalSet'

const REASONS: readonly DropReason[] = [
  'outside',
  'overlap',
  'unknownPlant',
  'fixed',
  'unknownRef',
  'tooSmall',
]

/** The read proposals, each with what it would add and a button to make it a new design. */
export function ProposalList({ project, proposals }: { project: Project; proposals: Proposal[] }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  if (proposals.length === 0) return <p className={panels.smallHint}>{t('proposals.list.empty')}</p>

  async function use(proposal: Proposal) {
    setBusy(true)
    setFailed(false)
    try {
      await applyProposal(proposal)
    } catch (error) {
      console.warn('Using the proposal failed', error)
      setFailed(true)
      setBusy(false)
    }
  }

  return (
    <>
      {failed && (
        <p className={panels.warning} role="alert">
          {t('proposals.list.failed')}
        </p>
      )}
      <ul className={styles.cards} data-testid="proposal-list" aria-busy={busy}>
        {proposals.map((proposal) => (
          <ProposalCard
            key={proposal.id}
            project={project}
            proposal={proposal}
            disabled={busy}
            onUse={() => void use(proposal)}
          />
        ))}
      </ul>
    </>
  )
}

function ProposalCard({
  project,
  proposal,
  disabled,
  onUse,
}: {
  project: Project
  proposal: Proposal
  disabled: boolean
  onUse: () => void
}) {
  const { t } = useTranslation()
  const report = useMemo(
    () => expandProposal(project, proposal, { year: plantingYear() }).report,
    [project, proposal],
  )
  const dropped = REASONS.map((reason) => ({
    reason,
    count: report.dropped.filter((d) => d.reason === reason).length,
  })).filter((d) => d.count > 0)

  return (
    <li className={styles.card} data-testid="proposal">
      <h3>{proposal.title}</h3>
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
      <button
        type="button"
        className={cx(controls.button, controls.primary, controls.small)}
        disabled={disabled}
        aria-label={t('proposals.list.useNamed', { title: proposal.title })}
        onClick={onUse}
      >
        {t('proposals.list.use')}
      </button>
    </li>
  )
}
