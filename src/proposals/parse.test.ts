import { describe, expect, it } from 'vitest'
import type { Proposal } from './format'
import { buildContinuePrompt, mergeProposals, parseAnswer } from './parse'

const proposal = (id: string, extra: object = {}) => ({
  id,
  title: `Title ${id}`,
  concept: 'A concept',
  tags: ['a'],
  highlights: ['b'],
  elements: [{ type: 'plant', plant: 'x', at: [1, 1] }],
  ...extra,
})
const answer = (...ids: string[]) =>
  JSON.stringify(
    { format: 'garden-proposals/1', proposals: ids.map((id) => proposal(id)) },
    null,
    2,
  )

describe('parseAnswer', () => {
  it('reads JSON from a code fence', () => {
    const result = parseAnswer(`Here you go:\n\n\`\`\`json\n${answer('a', 'b')}\n\`\`\`\nEnjoy!`)
    expect(result).toMatchObject({ ok: true, truncated: false })
    expect(result.ok && result.proposals.map((p) => p.id)).toEqual(['a', 'b'])
  })

  it('reads a bare answer', () => {
    const result = parseAnswer(answer('a'))
    expect(result.ok && result.proposals).toHaveLength(1)
  })

  it('keeps complete proposals of a truncated answer', () => {
    const text = answer('a', 'b', 'c')
    const cut = text.slice(0, text.indexOf('"id": "c"') + 30)
    const result = parseAnswer(`\`\`\`json\n${cut}`)
    expect(result).toMatchObject({ ok: true, truncated: true })
    expect(result.ok && result.proposals.map((p) => p.id)).toEqual(['a', 'b'])
  })

  it('merges pastes by id', () => {
    const a = parseAnswer(answer('a', 'b'))
    const b = parseAnswer(
      JSON.stringify({ proposals: [proposal('b', { title: 'New' }), proposal('c')] }),
    )
    if (!a.ok || !b.ok) throw new Error('parse failed')
    const merged = mergeProposals(a.proposals, b.proposals)
    expect(merged.map((p: Proposal) => p.id)).toEqual(['a', 'b', 'c'])
    expect(merged[1]?.title).toBe('New')
  })

  it('reports per-proposal issues with paths', () => {
    const bad = proposal('bad', {
      elements: [
        { type: 'object', kind: 'terrace', rect: { c: [1, 1], w: 2, d: 2 }, material: 'gold' },
      ],
    })
    const result = parseAnswer(
      JSON.stringify({ proposals: [proposal('ok'), bad, proposal('c', { title: 5 })] }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.proposals.map((p) => p.id)).toEqual(['ok'])
    expect(result.problems).toHaveLength(2)
    expect(result.problems[0]).toMatchObject({
      index: 1,
      proposalId: 'bad',
      issues: [{ code: 'material', path: 'elements.0.material' }],
    })
    expect(result.problems[1]?.issues[0]).toEqual({ code: 'type', path: 'title' })
  })

  it('errors on text without JSON', () => {
    expect(parseAnswer('   ')).toEqual({ ok: false, error: 'empty' })
    expect(parseAnswer('no json here')).toEqual({ ok: false, error: 'noJson' })
    expect(parseAnswer('{"hello": 1}')).toEqual({ ok: false, error: 'notProposals' })
  })

  it('continue prompt names missing and invalid ids', () => {
    const text = buildContinuePrompt({
      received: ['a', 'b'],
      invalid: ['c'],
      requested: 5,
      language: 'nl',
    })
    expect(text).toContain('a, b')
    expect(text).toContain('c')
    expect(text).toContain('3 more')
    expect(text).toContain('Dutch')
  })
})
