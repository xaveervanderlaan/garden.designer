import { describe, expect, it } from 'vitest'
import type { ProposalSetRecord } from '../../../persistence/proposalSets'
import { proposalSchema } from '../../../proposals/format'
import { discardProposals, toggleStar } from './proposalSet'

const proposal = (id: string) =>
  proposalSchema.parse({
    id,
    title: id,
    concept: '',
    tags: [],
    highlights: [],
    elements: [{ type: 'object', kind: 'terrace', rect: { c: [5, 5], w: 3, d: 3 } }],
  })

const set = (): ProposalSetRecord => ({
  id: 's',
  projectId: 'p',
  createdAt: 1,
  updatedAt: 1,
  baseUpdatedAt: 1,
  requested: 3,
  proposals: [proposal('p1'), proposal('p2'), proposal('p3')],
  problems: [],
})

describe('proposal set ops', () => {
  it('toggles a star', () => {
    const starred = toggleStar(set(), 'p2', 9)
    expect(starred.starred).toEqual(['p2'])
    expect(starred.updatedAt).toBe(9)
    expect(toggleStar(starred, 'p2', 10).starred).toEqual([])
  })

  it('discard removes proposals and their stars', () => {
    const next = discardProposals({ ...set(), starred: ['p1', 'p2'] }, ['p1', 'p3'], 5)
    expect(next.proposals.map((p) => p.id)).toEqual(['p2'])
    expect(next.starred).toEqual(['p2'])
  })
})
