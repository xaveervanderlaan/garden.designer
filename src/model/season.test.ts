import { describe, expect, it } from 'vitest'
import { BUILT_IN_PLANTS, builtInPlant } from '../data/plants'
import { samplePlant } from '../test/fixtures'
import type { Plant } from './schema'
import { inGroundMonths, plantAppearance, plantYear, seasonalHabit } from './season'

const plant = (id: string): Plant => {
  const found = builtInPlant(id)
  if (!found) throw new Error(`No built-in plant ${id}`)
  return found
}

/** A deciduous shrub to vary: no flowers, green leaves, red in autumn. */
const shrub: Plant = {
  ...samplePlant,
  id: 'custom-shrub',
  evergreen: false,
  bloomMonths: [5, 6],
  flowerColors: ['white', 'pink'],
  foliageColor: 'green',
  autumnColor: 'red',
}

const states = (p: Plant) => plantYear(p).map((a) => a.state)

describe('plantAppearance', () => {
  it('shows the first flower colour in bloom months', () => {
    expect(plantAppearance(shrub, 5)).toEqual({ state: 'flowering', color: 'white' })
    expect(plantAppearance(shrub, 6)).toEqual({ state: 'flowering', color: 'white' })
  })

  it('shows the foliage colour in leaf, the autumn colour in October and November', () => {
    expect(plantAppearance(shrub, 4)).toEqual({ state: 'leaf', color: 'green' })
    expect(plantAppearance(shrub, 9)).toEqual({ state: 'leaf', color: 'green' })
    expect(plantAppearance(shrub, 10)).toEqual({ state: 'autumn', color: 'red' })
    expect(plantAppearance(shrub, 11)).toEqual({ state: 'autumn', color: 'red' })
  })

  it('draws deciduous woody plants bare from December to March', () => {
    for (const month of [12, 1, 2, 3]) {
      expect(plantAppearance(shrub, month)).toEqual({ state: 'bare', color: null })
    }
    // prettier-ignore
    expect(states(plant('acer-campestre'))).toEqual([
      'bare', 'bare', 'bare', 'flowering', 'flowering', 'leaf',
      'leaf', 'leaf', 'leaf', 'autumn', 'autumn', 'bare',
    ])
  })

  it('keeps deciduous plants without an autumn colour green in autumn', () => {
    const plain = { ...shrub, autumnColor: undefined }
    expect(plantAppearance(plain, 10)).toEqual({ state: 'leaf', color: 'green' })
  })

  it('keeps evergreens in leaf all winter', () => {
    for (const month of [12, 1, 2, 3]) {
      expect(plantAppearance(samplePlant, month)).toEqual({ state: 'leaf', color: 'grey-green' })
    }
    expect(plantAppearance(samplePlant, 7)).toEqual({ state: 'flowering', color: 'purple' })
    // Evergreens with an autumn colour colour up, but never go bare.
    expect(plantAppearance(plant('bergenia-cordifolia'), 11).state).toBe('autumn')
    expect(states(plant('bergenia-cordifolia'))).not.toContain('bare')
  })

  it('lets flowers win over bare branches', () => {
    const witchHazel = plant('hamamelis-intermedia') // flowers in January and February
    expect(plantAppearance(witchHazel, 1).state).toBe('flowering')
    expect(plantAppearance(witchHazel, 3)).toEqual({ state: 'bare', color: null })
  })

  it('lets herbaceous perennials and ferns die back in winter', () => {
    const fern = plant('athyrium-filix-femina')
    expect(seasonalHabit(fern)).toBe('herbaceous')
    expect(plantAppearance(fern, 1)).toEqual({ state: 'dormant', color: null })
    expect(plantAppearance(fern, 4).state).toBe('leaf')
  })

  it('keeps deciduous grasses standing in their autumn colour until March', () => {
    const miscanthus = plant('miscanthus-sinensis') // plumes Aug–Oct, bronze autumn colour
    // prettier-ignore
    expect(states(miscanthus)).toEqual([
      'autumn', 'autumn', 'dormant', 'leaf', 'leaf', 'leaf',
      'leaf', 'flowering', 'flowering', 'flowering', 'autumn', 'autumn',
    ])
  })

  it('shows bulbs only around their bloom months', () => {
    const tulip = plant('tulipa-darwin-hybrid-group') // April–May
    // prettier-ignore
    expect(states(tulip)).toEqual([
      'dormant', 'dormant', 'leaf', 'flowering', 'flowering', 'leaf',
      'dormant', 'dormant', 'dormant', 'dormant', 'dormant', 'dormant',
    ])
    const snowdrop = plant('galanthus-nivalis') // January–March: in leaf from December
    expect(plantAppearance(snowdrop, 12).state).toBe('leaf')
    expect(plantAppearance(snowdrop, 4).state).toBe('leaf')
    expect(plantAppearance(snowdrop, 5).state).toBe('dormant')
  })

  it('shows annual vegetables only while they are in the ground', () => {
    const tomato = plant('solanum-lycopersicum') // planted out in May, harvested Jul–Oct
    expect(seasonalHabit(tomato)).toBe('annual')
    // prettier-ignore
    expect(states(tomato)).toEqual([
      'dormant', 'dormant', 'dormant', 'dormant', 'leaf', 'leaf',
      'leaf', 'leaf', 'leaf', 'leaf', 'dormant', 'dormant',
    ])
  })

  it('gives every built-in plant a colour unless it is bare or dormant', () => {
    for (const p of BUILT_IN_PLANTS) {
      for (const a of plantYear(p)) {
        expect(a.color === null, p.id).toBe(a.state === 'bare' || a.state === 'dormant')
      }
    }
  })
})

describe('inGroundMonths', () => {
  it('runs from sowing or planting out to the end of the following harvest', () => {
    // Garlic: planted Oct–Nov or Feb–Mar, harvested Jun–Aug.
    expect([...inGroundMonths(plant('allium-sativum'))].sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12,
    ])
    // Spinach: two crops, spring and autumn.
    expect([...inGroundMonths(plant('spinacia-oleracea'))].sort((a, b) => a - b)).toEqual([
      3, 4, 5, 6, 8, 9, 10, 11,
    ])
  })

  it('is empty without a calendar', () => {
    expect(inGroundMonths(shrub).size).toBe(0)
  })
})
