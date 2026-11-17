import { describe, expect, it } from 'vitest'
import { PROPOSAL_OBJECT_KINDS, answerJsonSchema, elementSchema } from './format'

const rect = { c: [3, 4], w: 2, d: 1.5 }

describe('proposal format', () => {
  it('accepts every element type', () => {
    const elements = [
      { type: 'object', kind: 'terrace', rect, material: 'wood', extra: 1 },
      {
        type: 'object',
        kind: 'lawn',
        polygon: [
          [0, 0],
          [4, 0],
          [4, 3],
        ],
      },
      {
        type: 'object',
        kind: 'fence',
        line: [
          [0, 0],
          [4, 0],
        ],
        thicknessM: 1,
      },
      { type: 'object', kind: 'compost', at: [1, 1] },
      { type: 'bed', kind: 'bed-ornamental', rect, mix: [{ plant: 'x', share: 2 }] },
      {
        type: 'bed',
        kind: 'bed-vegetable',
        polygon: [
          [0, 0],
          [4, 0],
          [4, 3],
        ],
        crops: [{ plant: 'x', rows: 2 }],
      },
      {
        type: 'hedge',
        line: [
          [0, 0],
          [5, 0],
        ],
        plant: 'carpinus-betulus-hedge',
      },
      { type: 'plant', plant: 'x', at: [1, 2] },
      { type: 'group', plant: 'x', at: [1, 2], count: 5 },
      { type: 'remove', ref: 'E3' },
    ]
    for (const element of elements) {
      const result = elementSchema.safeParse(element)
      expect(result.success, JSON.stringify(element)).toBe(true)
    }
    // Unknown keys are stripped.
    expect(elementSchema.parse(elements[0])).not.toHaveProperty('extra')
  })

  it('rejects geometry that does not fit the kind', () => {
    const bad = [
      { type: 'object', kind: 'terrace', at: [1, 1] },
      { type: 'object', kind: 'fence', rect },
      { type: 'object', kind: 'compost', rect },
      { type: 'object', kind: 'terrace', rect, at: [1, 1] },
      { type: 'object', kind: 'house', rect },
      { type: 'bed', kind: 'bed-vegetable' },
    ]
    for (const element of bad) {
      const result = elementSchema.safeParse(element)
      expect(result.success, JSON.stringify(element)).toBe(false)
    }
  })

  it('rejects unknown materials and variants', () => {
    expect(
      elementSchema.safeParse({ type: 'object', kind: 'terrace', rect, material: 'gold' }).success,
    ).toBe(false)
    expect(
      elementSchema.safeParse({ type: 'object', kind: 'compost', at: [0, 0], variant: 'huge' })
        .success,
    ).toBe(false)
  })

  it('mix only on ornamental beds', () => {
    const mix = [{ plant: 'x', share: 1 }]
    expect(elementSchema.safeParse({ type: 'bed', kind: 'bed-vegetable', rect, mix }).success).toBe(
      false,
    )
    expect(elementSchema.safeParse({ type: 'bed', kind: 'raised-bed', rect, mix }).success).toBe(
      false,
    )
    expect(
      elementSchema.safeParse({
        type: 'bed',
        kind: 'bed-ornamental',
        rect,
        crops: [{ plant: 'x' }],
      }).success,
    ).toBe(false)
  })

  it('JSON Schema lists the proposal object kinds', () => {
    const text = JSON.stringify(answerJsonSchema())
    for (const kind of PROPOSAL_OBJECT_KINDS) expect(text).toContain(`"${kind}"`)
    expect(PROPOSAL_OBJECT_KINDS).not.toContain('house')
    expect(PROPOSAL_OBJECT_KINDS).not.toContain('hedge')
  })
})
