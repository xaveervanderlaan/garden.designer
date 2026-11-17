import { newId } from '../../../model/ids'
import type { ProposalSetRecord } from '../../../persistence/proposalSets'
import { type AnswerProblem, type ParsedAnswer, mergeProposals } from '../../../proposals/parse'

type ReadAnswer = Extract<ParsedAnswer, { ok: true }>

/**
 * Adds a read answer to a set (or starts one when `set` is null). Proposals merge by id; a problem
 * is dropped once its proposal arrives valid, and a newer problem for the same id replaces it.
 */
export function addAnswerToSet(
  set: ProposalSetRecord | null,
  answer: ReadAnswer,
  base: { projectId: string; updatedAt: number; requested: number },
  now: number,
): ProposalSetRecord {
  const proposals = mergeProposals(set?.proposals ?? [], answer.proposals)
  const valid = new Set(proposals.map((p) => p.id))
  const newIds = new Set(answer.problems.map((p) => p.proposalId).filter(Boolean))
  const kept = (set?.problems ?? []).filter(
    (p) => p.proposalId !== undefined && !valid.has(p.proposalId) && !newIds.has(p.proposalId),
  )
  const added = answer.problems.filter(
    (p) => p.proposalId === undefined || !valid.has(p.proposalId),
  )
  const problems: AnswerProblem[] = [...kept, ...added]
  return set
    ? { ...set, updatedAt: now, proposals, problems }
    : {
        id: newId(),
        projectId: base.projectId,
        createdAt: now,
        updatedAt: now,
        baseUpdatedAt: base.updatedAt,
        requested: base.requested,
        proposals,
        problems,
      }
}

/** The year new plants go in: this year. */
export const plantingYear = (): number => new Date().getFullYear()

export const nowMs = (): number => Date.now()

/** Stars a proposal, or removes its star. */
export function toggleStar(set: ProposalSetRecord, id: string, now: number): ProposalSetRecord {
  const starred = set.starred ?? []
  return {
    ...set,
    updatedAt: now,
    starred: starred.includes(id) ? starred.filter((s) => s !== id) : [...starred, id],
  }
}

/** Removes proposals and their stars from a set. */
export function discardProposals(
  set: ProposalSetRecord,
  ids: readonly string[],
  now: number,
): ProposalSetRecord {
  const gone = new Set(ids)
  return {
    ...set,
    updatedAt: now,
    proposals: set.proposals.filter((p) => !gone.has(p.id)),
    starred: (set.starred ?? []).filter((s) => !gone.has(s)),
  }
}

/** How many variations "More like this" can ask for, and the default. */
export const MORE_LIKE_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8] as const
export const MORE_LIKE_DEFAULT = 4
