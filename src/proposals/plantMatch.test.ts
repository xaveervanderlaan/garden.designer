import { describe, expect, it } from 'vitest'
import { BUILT_IN_PLANTS } from '../data/plants'
import { samplePlant } from '../test/fixtures'
import { resolvePlant } from './plantMatch'

describe('resolvePlant', () => {
  const custom = { ...samplePlant, names: { ...samplePlant.names, latin: 'Hortus specialis' } }
  const plants = [...BUILT_IN_PLANTS, custom]

  it('matches ids, Latin names and near misses', () => {
    expect(resolvePlant(plants, 'betula-pendula')).toBe('betula-pendula')
    expect(resolvePlant(plants, 'custom-lavender')).toBe('custom-lavender')
    expect(resolvePlant(plants, 'Betula pendula')).toBe('betula-pendula')
    expect(resolvePlant(plants, 'Hortus  Specialis')).toBe('custom-lavender')
    expect(resolvePlant(plants, 'betula-pendulla')).toBe('betula-pendula')
    expect(resolvePlant(plants, 'Alchemila molis')).toBe('alchemilla-mollis')
    expect(resolvePlant(plants, 'no-such-plant')).toBeNull()
    expect(resolvePlant(plants, '')).toBeNull()
  })

  it('refuses ambiguous matches', () => {
    const twin = (id: string, latin: string) => ({
      ...samplePlant,
      id,
      names: { ...samplePlant.names, latin },
    })
    const list = [twin('custom-a', 'Rosa abcd'), twin('custom-b', 'Rosa abce')]
    expect(resolvePlant(list, 'rosa-abcf')).toBeNull()
    expect(resolvePlant(list, 'rosa abcd')).toBe('custom-a')
    // Two plants with the same Latin name (a species and its hedge variant).
    const same = [twin('custom-c', 'Acer campestre'), twin('custom-d', 'Acer campestre')]
    expect(resolvePlant(same, 'Acer campestre')).toBeNull()
  })
})
