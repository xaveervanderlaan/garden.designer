import { describe, expect, it } from 'vitest'
import { BUILT_IN_PLANTS } from '../../data/plants'
import { plantName } from '../../model/plants'
import type { Plant } from '../../model/schema'
import { samplePlant } from '../../test/fixtures'
import {
  type LibraryFilters,
  NO_FILTERS,
  activeFilterCount,
  filterPlants,
  matchesQuery,
  normalise,
} from './search'

const custom: Plant = {
  ...samplePlant,
  id: 'custom-1',
  names: { nl: 'Tante Annie’s lavendel', en: '', latin: '' },
}
const plants = [...BUILT_IN_PLANTS, custom]
const ctx = { lang: 'nl' as const, isCustom: (p: Plant) => p.id.startsWith('custom-') }
const find = (filters: Partial<LibraryFilters>, lang: 'en' | 'nl' = 'nl') =>
  filterPlants(plants, { ...NO_FILTERS, ...filters }, { ...ctx, lang })
const ids = (list: Plant[]) => list.map((p) => p.id)

describe('normalise', () => {
  it.each([
    ['Tête-à-Tête', 'tete a tete'],
    ['  Vergeet-mij-niet ', 'vergeet mij niet'],
    ["Acer platanoides 'Globosum'", 'acer platanoides globosum'],
    ['Suikermaïs', 'suikermais'],
    ['Laburnum × watereri', 'laburnum watereri'],
  ])('%j → %j', (input, expected) => expect(normalise(input)).toBe(expected))
})

describe('search', () => {
  it('finds lavender by its Dutch name, best match first', () => {
    const result = find({ query: 'lavendel' })
    expect(result[0]?.id).toBe('lavandula-angustifolia')
    expect(ids(result)).toContain('custom-1')
  })

  it('matches English and Latin names, ignoring case and accents', () => {
    expect(ids(find({ query: 'LAVANDULA' }))).toEqual(['lavandula-angustifolia'])
    expect(ids(find({ query: 'english lavender' }))).toEqual(['lavandula-angustifolia'])
    expect(ids(find({ query: 'tete a tete' }))).toEqual(['narcissus-tete-a-tete'])
    expect(ids(find({ query: 'Tête' }))).toEqual(['narcissus-tete-a-tete'])
    expect(ids(find({ query: 'suikermais' }))).toEqual(['zea-mays'])
  })

  it('needs every word to match, in any of the names', () => {
    expect(
      matchesQuery(
        BUILT_IN_PLANTS.find((p) => p.id === 'acer-palmatum')!,
        'japanse acer',
      ),
    ).toBe(true)
    expect(find({ query: 'japanse zzz' })).toEqual([])
  })

  it('ranks a name that starts with the query above one that only contains it', () => {
    const result = ids(find({ query: 'eik' }, 'nl'))
    expect(result[0]).toBe('polypodium-vulgare') // "Gewone eikvaren": a word starting with "eik"
    expect(result).toContain('quercus-robur') // "Zomereik": contains "eik"
  })
})

describe('filters', () => {
  it('filters by category, and "custom" shows only the design’s own plants', () => {
    const trees = find({ category: 'tree' })
    expect(trees.length).toBeGreaterThan(20)
    expect(trees.every((p) => p.category === 'tree')).toBe(true)
    expect(ids(find({ category: 'custom' }))).toEqual(['custom-1'])
  })

  it('keeps plants that flower in any of the chosen months', () => {
    const result = find({ bloomMonths: [1, 2] })
    expect(result.length).toBeGreaterThan(3)
    expect(result.every((p) => p.bloomMonths.some((m) => m === 1 || m === 2))).toBe(true)
    expect(ids(result)).toContain('galanthus-nivalis')
  })

  it('filters by flower colour (any) and foliage colour', () => {
    const blue = find({ flowerColors: ['blue'] })
    expect(blue.every((p) => p.flowerColors.includes('blue'))).toBe(true)
    const silver = find({ foliageColors: ['silver', 'burgundy'] })
    expect(silver.length).toBeGreaterThan(3)
    expect(silver.every((p) => p.foliageColor === 'silver' || p.foliageColor === 'burgundy')).toBe(
      true,
    )
  })

  it('combines native, wildlife (all of them) and non-toxic', () => {
    const result = find({ nativeNL: true, wildlife: ['bees', 'birds'], nonToxic: true })
    expect(result.length).toBeGreaterThan(3)
    for (const p of result) {
      expect(p.nativeNL && !p.toxic).toBe(true)
      expect(p.wildlife).toEqual(expect.arrayContaining(['bees', 'birds']))
    }
    expect(ids(result)).toContain('sorbus-aucuparia')
    expect(ids(result)).not.toContain('ilex-aquifolium') // toxic berries
  })

  it('counts active filters, not the search text or category', () => {
    expect(activeFilterCount(NO_FILTERS)).toBe(0)
    expect(
      activeFilterCount({
        ...NO_FILTERS,
        query: 'x',
        category: 'tree',
        bloomMonths: [5, 6],
        wildlife: ['bees', 'birds'],
        nonToxic: true,
      }),
    ).toBe(4)
  })

  it('sorts by name in the UI language', () => {
    for (const lang of ['nl', 'en'] as const) {
      const names = find({ category: 'shrub' }, lang).map((p) => plantName(p, lang))
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, lang)))
    }
  })
})
