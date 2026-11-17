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
