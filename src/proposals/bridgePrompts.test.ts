import { describe, expect, it } from 'vitest'
import { defaultBrief } from '../model/brief'
import {
  bridgePrefix,
  bridgeRequestCount,
  buildConceptsPrompt,
  buildDetailPrompt,
  buildRetryPrompt,
  parseConcepts,
  type Concept,
} from './bridgePrompts'
import type { PromptInput } from './prompt'
import { emptyPlot } from './testProject'

function input(): PromptInput {
  const project = emptyPlot()
  project.name = 'Secret Name'
  project.settings.location = { lat: 52.123456, lng: 5.654321 }
  return { project, brief: defaultBrief(), language: 'nl', sunMap: null, year: 2027 }
}

const concept = (id: string, title = `Idea ${id}`): Concept => ({
  id,
  title,
  concept: `About ${title}`,
  tags: ['t'],
  highlights: ['h'],
})
const ALL = ['p1', 'p2', 'p3', 'p4', 'p5'].map((id) => concept(id))

describe('bridge prompts', () => {
  it('concept and detail prompts share the same beginning', () => {
    const prefix = bridgePrefix(input())
    const concepts = buildConceptsPrompt(input(), 12)
    const detail = buildDetailPrompt(input(), { batch: ALL.slice(0, 3), all: ALL })
    expect(concepts.startsWith(prefix + '\n\n# Answer')).toBe(true)
    expect(detail.startsWith(prefix + '\n\n# Answer')).toBe(true)
    expect(concepts).toContain('garden-concepts/1')
    expect(concepts).toContain('Give 12 design concepts')
    expect(concepts).toContain('in Dutch')
    expect(bridgeRequestCount(12)).toBe(5)
    expect(bridgeRequestCount(4)).toBe(3)
  })

  it('detail prompt names its ids and the other titles', () => {
    const detail = buildDetailPrompt(input(), { batch: ALL.slice(3), all: ALL })
    expect(detail.trimEnd().split('\n').at(-1)).toBe('Ids to answer: p4, p5')
    expect(detail).toContain('garden-proposals/1')
    expect(detail).toContain(JSON.stringify(ALL[3]))
    for (const id of ['p1', 'p2', 'p3']) expect(detail).toContain(`- ${id}: Idea ${id}`)
    expect(detail).not.toContain('- p4: Idea p4')
  })

  it('reads concepts and renumbers them', () => {
    const answer = {
      format: 'garden-concepts/1',
      concepts: [
        { id: 'c1', title: 'Wild', concept: 'Meadow', tags: [], highlights: [] },
        { id: 'c2', title: 42 },
        { id: 'x', title: 'Formal', concept: 'Box hedges', tags: ['neat'], highlights: ['axis'] },
        { id: 'y', title: 'Third', concept: 'Extra', tags: [], highlights: [] },
      ],
    }
    const result = parseConcepts('Sure!\n```json\n' + JSON.stringify(answer) + '\n```\n', 2)
    expect(result).toEqual({
      ok: true,
      concepts: [
        { id: 'p1', title: 'Wild', concept: 'Meadow', tags: [], highlights: [] },
        { id: 'p2', title: 'Formal', concept: 'Box hedges', tags: ['neat'], highlights: ['axis'] },
      ],
    })
    // A cut-off answer keeps its complete concepts.
    const cut = JSON.stringify(answer).slice(0, JSON.stringify(answer).indexOf('"Third"'))
    const salvaged = parseConcepts(cut, 12)
    expect(salvaged.ok && salvaged.concepts.map((c) => c.title)).toEqual(['Wild', 'Formal'])
    expect(parseConcepts('No idea, sorry.', 3)).toEqual({ ok: false, error: 'noJson' })
    expect(parseConcepts('{"concepts": [{"title": 1}]}', 3)).toEqual({
      ok: false,
      error: 'invalid',
    })
  })

  it('retry prompt lists the problems, not the old answer', () => {
    const detail = buildDetailPrompt(input(), { batch: ALL.slice(0, 3), all: ALL })
    const retry = buildRetryPrompt(detail, {
      problems: [
        {
          index: 1,
          proposalId: 'p2',
          title: 'OLD ANSWER TITLE',
          issues: [{ code: 'material', path: 'elements.3.material' }],
        },
      ],
      missing: ['p3'],
    })
    expect(retry.startsWith(bridgePrefix(input()))).toBe(true)
    expect(retry).toContain('# Corrections')
    expect(retry).toContain('- p2, elements.3.material: this material is not allowed')
    expect(retry).toContain('- p3: missing from the answer')
    expect(retry).not.toContain('OLD ANSWER TITLE')
    expect(retry.match(/Ids to answer:/g)).toHaveLength(1)
    expect(retry.trimEnd().split('\n').at(-1)).toBe('Ids to answer: p2, p3')
  })

  it('contains no name or location', () => {
    const texts = [
      buildConceptsPrompt(input(), 6),
      buildDetailPrompt(input(), { batch: ALL.slice(0, 3), all: ALL }),
    ]
    for (const text of texts) {
      for (const secret of ['Secret Name', '52.12', '5.65']) expect(text).not.toContain(secret)
      expect(text).not.toMatch(/latitude|longitude/i)
    }
  })
})
