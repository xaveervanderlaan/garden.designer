import { useMemo } from 'react'
import { defaultBrief } from '../../../model/brief'
import type { Project } from '../../../model/schema'
import { type ChecklistItem, briefChecklist } from '../../../proposals/checklist'
import { type ExpansionReport, expandProposal } from '../../../proposals/expand'
import { type ProposalFigures, proposalFigures } from '../../../proposals/figures'
import { fingerprint } from '../../../proposals/fingerprint'
import type { Proposal } from '../../../proposals/format'

/** One proposal as the gallery shows it: the design it makes, its figures and brief checklist. */
export type GalleryEntry = {
  proposal: Proposal
  expanded: Project
  report: ExpansionReport
  figures: ProposalFigures
  checklist: ChecklistItem[]
}

const memo = new WeakMap<Project, Map<string, GalleryEntry>>()

/** The gallery entry for a proposal on a design, computed once per design version. */
export function galleryEntry(base: Project, proposal: Proposal, year: number): GalleryEntry {
  let entries = memo.get(base)
  if (!entries) {
    entries = new Map()
    memo.set(base, entries)
  }
  const key = `${fingerprint(proposal)}|${year}`
  const known = entries.get(key)
  if (known) return known
  const { project: expanded, report } = expandProposal(base, proposal, { year })
  const entry: GalleryEntry = {
    proposal,
    expanded,
    report,
    figures: proposalFigures(expanded),
    checklist: briefChecklist(expanded, base.brief ?? defaultBrief()),
  }
  entries.set(key, entry)
  return entry
}

export function useGalleryEntries(
  base: Project,
  proposals: readonly Proposal[],
  year: number,
): GalleryEntry[] {
  return useMemo(() => proposals.map((p) => galleryEntry(base, p, year)), [base, proposals, year])
}
