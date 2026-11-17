import { z } from 'zod'
import { proposalSchema } from '../proposals/format'
import { ISSUE_CODES } from '../proposals/parse'
import { db } from './db'

export const MAX_PROPOSAL_SETS = 5

const problemSchema = z.object({
  index: z.number(),
  proposalId: z.string().optional(),
  title: z.string().optional(),
  issues: z.array(z.object({ code: z.enum(ISSUE_CODES), path: z.string() })),
})

export const proposalSetSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  createdAt: z.number(),
  updatedAt: z.number(),
  /** The design's `updatedAt` when the set was made: a later value means the design changed. */
  baseUpdatedAt: z.number(),
  requested: z.number().int().min(1),
  proposals: z.array(proposalSchema),
  problems: z.array(problemSchema),
})

export type ProposalSetRecord = z.infer<typeof proposalSetSchema>

/** Saves a set and keeps only the newest MAX_PROPOSAL_SETS of its design. */
export async function saveProposalSet(record: ProposalSetRecord): Promise<void> {
  await db.transaction('rw', db.proposalSets, async () => {
    await db.proposalSets.put(record)
    const all = await db.proposalSets.where('projectId').equals(record.projectId).toArray()
    const stale = all
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(MAX_PROPOSAL_SETS)
      .map((r) => r.id)
    if (stale.length > 0) await db.proposalSets.bulkDelete(stale)
  })
}

/** The design's sets, newest first. Records that no longer validate are skipped. */
export async function listProposalSets(projectId: string): Promise<ProposalSetRecord[]> {
  const rows = await db.proposalSets.where('projectId').equals(projectId).toArray()
  return rows
    .flatMap((row) => {
      const parsed = proposalSetSchema.safeParse(row)
      return parsed.success ? [parsed.data] : []
    })
    .sort((a, b) => b.updatedAt - a.updatedAt)
}
