import { describe, expect, it } from 'vitest'
import { defaultBrief } from '../model/brief'
import type { Brief } from '../model/schema'
import { sampleProjectWithAsset } from '../test/fixtures'
import { buildPrompt, edgeFacing, promptSections, promptSize, type PromptInput } from './prompt'

function input(brief: Partial<Brief> = {}, extra: Partial<PromptInput> = {}): PromptInput {
  const { project } = sampleProjectWithAsset('Secret Garden Name')
  project.settings.location = { lat: 52.123456, lng: 5.654321 }
  project.objects.push({
    id: 'shed-1',
    kind: 'shed',
    shape: {
      type: 'polygon',
      points: [
        { x: 15, y: 10 },
        { x: 18, y: 10 },
        { x: 18, y: 13 },
        { x: 15, y: 13 },
      ],
    },
    heightM: 2.4,
    layer: 'existing',
    status: 'existing',
    label: 'Grandpa shed',
    notes: 'Private note',
  })
  const full = { ...defaultBrief(), ...brief }
  project.brief = full
  return { project, brief: full, language: 'en', sunMap: null, year: 2027, ...extra }
}

describe('buildPrompt', () => {
  it('is deterministic', () => {
    expect(buildPrompt(input())).toBe(buildPrompt(input()))
    expect(promptSize('abcdefghi')).toEqual({ chars: 9, tokens: 3 })
  })

  it('never includes the name, location or site plan', () => {
    const text = buildPrompt(input())
    for (const secret of [
      'Secret Garden Name',
      '52.12',
      '5.65',
      'site-plan',
      'Grandpa',
      'Border',
    ]) {
      expect(text).not.toContain(secret)
    }
    expect(text).not.toContain('Private note')
    expect(text).not.toMatch(/latitude|longitude/i)
  })

  it('lists plot edges with their facing', () => {
    const site = promptSections(input()).site
    // Plot (0,0)-(20,0)-(20,15)-(0,15), north up: the top edge faces north.
    expect(site).toContain('- A–B: 20 m, faces N')
    expect(site).toContain('- B–C: 15 m, faces E')
    expect(site).toContain('- C–D: 20 m, faces S')
    expect(site).toContain('- D–A: 15 m, faces W')
    const outline = [
      { x: 0, y: 0 },
      { x: 0, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 0 },
    ]
    // Same edges listed the other way round; north turned 90° clockwise (north to the right).
    expect(edgeFacing(outline, 0, 0).compass).toBe('W')
    expect(edgeFacing(outline, 0, 90).compass).toBe('S')
    expect(edgeFacing(outline, 2, 45).compass).toBe('NE')
  })

  it('leaves out avoided and toxic plants', () => {
    const plain = promptSections(input()).catalogue
    expect(plain).toContain('\nbetula-pendula | ')
    expect(plain).toContain('\nhedera-helix | ')
    const avoided = promptSections(input({ avoidPlants: ['betula-pendula'], avoidToxic: true }))
    expect(avoided.catalogue).not.toContain('betula-pendula')
    expect(avoided.catalogue).not.toContain('hedera-helix')
    expect(avoided.catalogue).toContain('\ncustom-lavender | Lavender | Lavandula angustifolia')
    const nl = promptSections(input({}, { language: 'nl' }))
    expect(nl.catalogue).toContain('custom-lavender | Lavendel |')
    expect(nl.answer).toContain('in Dutch')
  })

  it('includes the sun map only when given', () => {
    expect(promptSections(input()).site).not.toContain('Sun map')
    const sunMap = { originX: 0, originY: 0, cellM: 2, rows: ['FFPS', '.FFS'] }
    const site = promptSections(input({}, { sunMap })).site
    expect(site).toContain('Sun map')
    expect(site).toContain('\nFFPS\n.FFS')
  })

  it('marks may-change items with refs', () => {
    const site = promptSections(input({ mayChange: ['shed-1'] })).site
    expect(site).toContain('- E1 fixed: bed-ornamental, polygon [[1,1],[5,1],[5,3]]')
    expect(site).toContain('- E2 may change: shed, polygon')
    expect(site).toContain('height 2.4')
    expect(site).toContain('- P1 fixed: plant custom-lavender at [4,1.5], spread 0.6')
  })
})
