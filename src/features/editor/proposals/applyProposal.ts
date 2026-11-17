import { PROJECT_NAME_MAX_LENGTH } from '../../../model/schema'
import { duplicateProject } from '../../../persistence/projects'
import { expandProposal } from '../../../proposals/expand'
import type { Proposal } from '../../../proposals/format'
import { hrefFor } from '../../../routing'
import { useProjectStore } from '../../../store/projectStore'
import { plantingYear } from './proposalSet'

/** The new design's name: "<design> — <proposal title>", cut to the maximum length. */
export function proposalDesignName(base: string, title: string): string {
  return `${base} — ${title}`.slice(0, PROJECT_NAME_MAX_LENGTH).trim()
}

/**
 * "Use this design": saves the open design, then creates a copy with the proposal applied (in one
 * transaction, validated, so nothing is half-created) and opens it. Returns the new design's id.
 */
export async function applyProposal(proposal: Proposal, year = plantingYear()): Promise<string> {
  const store = useProjectStore.getState()
  const base = store.project
  if (!base) throw new Error('No design is open')
  await store.flush()
  const copy = await duplicateProject(
    base.id,
    proposalDesignName(base.name, proposal.title),
    (project) => expandProposal(project, proposal, { year }).project,
  )
  window.location.hash = hrefFor({ name: 'editor', projectId: copy.id })
  return copy.id
}
