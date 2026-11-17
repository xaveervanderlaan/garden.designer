import { describe, expect, it } from 'vitest'
import { defaultBrief } from '../model/brief'
import { proposalSchema } from './format'
import { type FollowUpRequest, buildFollowUpPrompt } from './followUp'
import type { PromptInput } from './prompt'
import { emptyPlot } from './testProject'

const proposal = (id: string, title: string) =>
  proposalSchema.parse({
    id,
    title,
    concept: 'C',
    tags: [],
    highlights: [],
    elements: [{ type: 'object', kind: 'terrace', rect: { c: [5, 5], w: 3, d: 3 } }],
  })

function input(): PromptInput {
  const project = emptyPlot()
  project.name = 'Secret Name'
  project.settings.location = { lat: 52.123456, lng: 5.654321 }
  return { project, brief: defaultBrief(), language: 'en', sunMap: null, year: 2027 }
}

describe('buildFollowUpPrompt', () => {
  it('more like this asks for new ids and includes the proposal', () => {
    const text = buildFollowUpPrompt(input(), {
      kind: 'moreLike',
      proposal: proposal('p3', 'Cosy corner'),
      count: 4,
      usedIds: ['p1', 'p2', 'p3'],
    })
    expect(text).toContain('Make 4 new variations')
    expect(text).toContain('"id":"p3"')
    expect(text).toContain('not in this list: p1, p2, p3')
    expect(text).toContain('# Site')
    expect(text).toContain('# Answer format')
  })

  it('regenerate keeps the given ids', () => {
    const text = buildFollowUpPrompt(input(), {
      kind: 'regenerate',
      proposals: [proposal('p2', 'Two'), proposal('p5', 'Five')],
      keep: [proposal('p1', 'Kept idea')],
    })
    expect(text).toContain('using exactly these ids: p2, p5')
    expect(text).toContain('- Kept idea')
    expect(text).not.toContain('"id":"p2"')
  })

  it('uses the singular for one proposal', () => {
    const one = buildFollowUpPrompt(input(), {
      kind: 'regenerate',
      proposals: [proposal('p2', 'Two')],
      keep: [],
    })
    expect(one).toContain('Give 1 proposal, using')
    expect(one).not.toContain('1 proposals')
    const more = buildFollowUpPrompt(input(), {
      kind: 'regenerate',
      proposals: [proposal('p2', 'Two'), proposal('p5', 'Five')],
      keep: [],
    })
    expect(more).toContain('Give 2 proposals, using')
  })

  it('is deterministic and has no location', () => {
    const request: FollowUpRequest = {
      kind: 'regenerate',
      proposals: [proposal('p2', 'Two')],
      keep: [],
    }
    const a = buildFollowUpPrompt(input(), request)
    expect(a).toBe(buildFollowUpPrompt(input(), request))
    expect(a).not.toContain('Secret Name')
    expect(a).not.toContain('52.12')
  })
})
