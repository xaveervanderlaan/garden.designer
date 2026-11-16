import { describe, expect, it } from 'vitest'
import { builtInPlant } from '../data/plants'
import { plantSizeAt } from '../model/growth'
import type { Plant } from '../model/schema'
import { DEFAULT_PLANT_VIEW, GHOST_STYLE, SEASON_COLORS, plantAppearance } from './plantAppearance'
import { PLANT_COLOR_HEX } from './plantColors'
import { TRUNK_COLOR, symbolColor } from './plantSymbols'

const plant = (id: string): Plant => {
  const found = builtInPlant(id)
  if (!found) throw new Error(`No built-in plant ${id}`)
  return found
}

/** Field maple: deciduous tree, 8 m spread after 25 years, lime flowers Apr–May, yellow in autumn. */
const maple = plant('acer-campestre')
/** Cranesbill 'Rozanne': a perennial, blue flowers Jun–Oct, dies back in winter. */
const geranium = plant('geranium-rozanne')
/** Evergreen shrub, purple flowers Jun–Aug. */
const lavender = plant('lavandula-angustifolia')

const fills = (parts: readonly { fill?: string }[]) =>
  parts.map((p) => p.fill).filter((f): f is string => !!f)

describe('plantAppearance: growth year', () => {
  it('draws plants at their mature size by default, as before', () => {
    const appearance = plantAppearance(maple)
    expect(appearance.radiusM).toBe(4)
    expect(appearance.ghost).toBe(false)
    expect(appearance.season).toBeNull()
    expect(appearance.color).toBe(symbolColor(maple))
  })

  it('draws a planting at its size in the viewed year', () => {
    const view = { year: 2026, month: null }
    expect(plantAppearance(maple, view, 2026).radiusM).toBe(0.25)
    expect(plantAppearance(maple, { ...view, year: 2036 }, 2026).radiusM).toBeCloseTo(
      plantSizeAt(maple, 2026, 2036).spreadM / 2,
    )
    expect(plantAppearance(maple, { ...view, year: 'mature' }, 2026).radiusM).toBe(4)
  })

  it('ghosts a planting before its planting year, at its planting size', () => {
    const ghost = plantAppearance(maple, { year: 2026, month: null }, 2028)
    expect(ghost.ghost).toBe(true)
    expect(ghost.radiusM).toBe(0.25)
    expect(plantAppearance(maple, { year: 2028, month: null }, 2028).ghost).toBe(false)
    expect(GHOST_STYLE.opacity).toBeLessThan(1)
  })

  it('needs the planting year for a growth year (without it: mature)', () => {
    expect(plantAppearance(maple, { year: 2026, month: null }).radiusM).toBe(4)
  })

  it('gives the same object for the same plant, view and size', () => {
    const view = { year: 2030, month: 5 }
    expect(plantAppearance(maple, view, 2026)).toBe(plantAppearance(maple, { ...view }, 2026))
    expect(plantAppearance(maple)).toBe(plantAppearance(maple, DEFAULT_PLANT_VIEW))
    expect(plantAppearance(maple, view, 2026)).not.toBe(plantAppearance(maple, view, 2027))
  })

  it('draws an unknown plant as a grey disc at the default size', () => {
    const appearance = plantAppearance(undefined, { year: 2026, month: 1 }, 2030)
    expect(appearance.radiusM).toBeGreaterThan(0)
    expect(appearance.ghost).toBe(false)
    expect(appearance.parts).toHaveLength(1)
  })
})

describe('plantAppearance: month', () => {
  const inMonth = (p: Plant, month: number) => plantAppearance(p, { year: 'mature', month })

  it('keeps the usual look without a month: flower colour for perennials', () => {
    expect(plantAppearance(geranium).color).toBe(PLANT_COLOR_HEX.blue)
    expect(plantAppearance(lavender).color).toBe(PLANT_COLOR_HEX['grey-green'])
  })

  it('draws a plant in bloom in its flower colour, symbol and all', () => {
    const july = inMonth(lavender, 7)
    expect(july.season).toBe('flowering')
    expect(july.color).toBe(PLANT_COLOR_HEX.purple)
    expect(fills(july.parts)).toContain(PLANT_COLOR_HEX.purple)
  })

  it('draws leaves in the foliage colour, perennials too', () => {
    const may = inMonth(geranium, 5)
    expect(may.season).toBe('leaf')
    expect(may.color).toBe(PLANT_COLOR_HEX.green)
  })

  it('draws the autumn colour in October and November', () => {
    const october = inMonth(maple, 10)
    expect(october.season).toBe('autumn')
    expect(october.color).toBe(PLANT_COLOR_HEX.yellow)
    expect(fills(october.parts)).toContain(PLANT_COLOR_HEX.yellow)
  })

  it('draws deciduous woody plants bare in winter: outlines only, the trunk stays', () => {
    const january = inMonth(maple, 1)
    expect(january.season).toBe('bare')
    expect(january.color).toBeNull()
    expect(fills(january.parts)).toEqual([TRUNK_COLOR])
    const strokes = january.parts.map((p) => p.stroke).filter(Boolean)
    expect(strokes.length).toBeGreaterThan(0)
    expect(new Set(strokes)).toEqual(new Set([SEASON_COLORS.bare]))
    // Same shapes as the summer symbol, so a tree still looks like a tree.
    const summer = inMonth(maple, 7).parts.map((p) => p.d)
    for (const part of january.parts) expect(summer).toContain(part.d)
  })

  it('keeps evergreens green in winter', () => {
    const january = inMonth(lavender, 1)
    expect(january.season).toBe('leaf')
    expect(january.color).toBe(PLANT_COLOR_HEX['grey-green'])
  })

  it('draws dormant plants faint', () => {
    const january = inMonth(geranium, 1)
    expect(january.season).toBe('dormant')
    expect(january.color).toBe(SEASON_COLORS.dormantFill)
    expect(new Set(fills(january.parts))).toEqual(new Set([SEASON_COLORS.dormantFill]))
  })

  it('combines a month with a growth year', () => {
    const appearance = plantAppearance(maple, { year: 2026, month: 1 }, 2026)
    expect(appearance.season).toBe('bare')
    expect(appearance.radiusM).toBe(0.25)
  })
})
