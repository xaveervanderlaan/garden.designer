import { PROJECT_NAME_MAX_LENGTH, type Project } from '../../../model/schema'
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

/** Creates a copy of `base` with the proposal applied, in one transaction (validated). */
function createFromProposal(base: Project, proposal: Proposal, year: number) {
  return duplicateProject(
    base.id,
    proposalDesignName(base.name, proposal.title),
    (project) => expandProposal(project, proposal, { year }).project,
  )
}

function openBase(): Project {
  const base = useProjectStore.getState().project
  if (!base) throw new Error('No design is open')
  return base
}

/**
 * "Use this design": saves the open design, then creates a copy with the proposal applied (in one
 * transaction, validated, so nothing is half-created) and opens it. Returns the new design's id.
 */
export async function applyProposal(proposal: Proposal, year = plantingYear()): Promise<string> {
  const base = openBase()
  await useProjectStore.getState().flush()
  const copy = await createFromProposal(base, proposal, year)
  window.location.hash = hrefFor({ name: 'editor', projectId: copy.id })
  return copy.id
}

/**
 * "Use selected": saves the open design once, creates one new design per proposal (one after the
 * other, each on its own) and goes to the design list. Returns the new designs' ids.
 */
export async function applyProposals(
  proposals: readonly Proposal[],
  year = plantingYear(),
): Promise<string[]> {
  const base = openBase()
  await useProjectStore.getState().flush()
  const ids: string[] = []
  for (const proposal of proposals) ids.push((await createFromProposal(base, proposal, year)).id)
  window.location.hash = hrefFor({ name: 'projects' })
  return ids
}
