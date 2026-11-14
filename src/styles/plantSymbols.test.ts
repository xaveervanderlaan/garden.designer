import { describe, expect, it } from 'vitest'
import { BUILT_IN_PLANTS } from '../data/plants'
import { PLANT_CATEGORIES } from '../model/schema'
import { PLANT_COLOR_HEX } from './plantColors'
import { darken, plantSymbol, symbolColor } from './plantSymbols'

const HEX = /^#[0-9a-f]{6}$/

describe('plant symbols', () => {
  it.each(PLANT_CATEGORIES)('draws a %s with valid paths and colours', (category) => {
    const plant = BUILT_IN_PLANTS.find((p) => p.category === category)!
    const parts = plantSymbol(plant)
    expect(parts.length).toBeGreaterThan(0)
    for (const part of parts) {
      expect(part.d).toMatch(/^M /)
      expect(part.d).not.toMatch(/NaN|undefined/)
      if (part.fill) expect(part.fill).toMatch(HEX)
      if (part.stroke) expect(part.stroke).toMatch(HEX)
    }
  })

  it('uses the flower colour for perennials and bulbs, the leaf colour otherwise', () => {
    const lavender = BUILT_IN_PLANTS.find((p) => p.id === 'lavandula-angustifolia')!
    const salvia = BUILT_IN_PLANTS.find((p) => p.id === 'salvia-nemorosa-caradonna')!
    expect(symbolColor(lavender)).toBe(PLANT_COLOR_HEX['grey-green'])
    expect(symbolColor(salvia)).toBe(PLANT_COLOR_HEX.purple)
    expect(symbolColor({ ...salvia, flowerColors: [] })).toBe(PLANT_COLOR_HEX.green)
  })

  it('darkens colours', () => {
    expect(darken('#ffffff', 0.5)).toBe('#808080')
    expect(darken('#5d9a47', 0)).toBe('#5d9a47')
    expect(darken('#5d9a47', 1)).toBe('#000000')
  })
})
