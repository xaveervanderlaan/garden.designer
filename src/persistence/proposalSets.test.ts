import { describe, expect, it } from 'vitest'
import { db } from './db'
import { deleteProject } from './projects'
import {
  MAX_PROPOSAL_SETS,
  type ProposalSetRecord,
  listProposalSets,
  saveProposalSet,
} from './proposalSets'
import { sampleProjectWithAsset } from '../test/fixtures'

const record = (id: string, projectId: string, updatedAt: number): ProposalSetRecord => ({
  id,
  projectId,
  createdAt: updatedAt,
  updatedAt,
  baseUpdatedAt: 1,
  requested: 12,
  proposals: [],
  problems: [],
})

describe('proposal sets', () => {
  it('lists newest first', async () => {
    await saveProposalSet(record('a', 'p', 10))
    await saveProposalSet(record('b', 'p', 30))
    await saveProposalSet(record('c', 'p', 20))
    await saveProposalSet(record('x', 'other', 99))
    expect((await listProposalSets('p')).map((r) => r.id)).toEqual(['b', 'c', 'a'])
  })

  it('keeps the last 5 per design', async () => {
    for (let i = 1; i <= 7; i++) await saveProposalSet(record(`s${i}`, 'p', i))
    await saveProposalSet(record('o', 'other', 1))
    const ids = (await listProposalSets('p')).map((r) => r.id)
    expect(ids).toHaveLength(MAX_PROPOSAL_SETS)
    expect(ids[0]).toBe('s7')
    expect(ids).not.toContain('s2')
    expect(await listProposalSets('other')).toHaveLength(1)
  })

  it('deleting a design removes its sets', async () => {
    const { project, asset } = sampleProjectWithAsset()
    await db.projects.add(project)
    await db.assets.add(asset)
    await saveProposalSet(record('a', project.id, 1))
    await saveProposalSet(record('b', 'other', 1))
    await deleteProject(project.id)
    expect(await listProposalSets(project.id)).toEqual([])
    expect(await listProposalSets('other')).toHaveLength(1)
  })

  it('skips invalid records', async () => {
    await saveProposalSet(record('a', 'p', 1))
    await db.proposalSets.put({ ...record('bad', 'p', 2), requested: 0 })
    expect((await listProposalSets('p')).map((r) => r.id)).toEqual(['a'])
  })
})
