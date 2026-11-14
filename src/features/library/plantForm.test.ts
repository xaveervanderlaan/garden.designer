import { describe, expect, it } from 'vitest'
import { BUILT_IN_PLANTS } from '../../data/plants'
import i18n from '../../i18n'
import { blankCustomPlant, customCopyOf } from '../../model/plants'
import { fromDraft, toDraft } from './plantForm'

const tomato = BUILT_IN_PLANTS.find((p) => p.id === 'solanum-lycopersicum')!
const lavender = BUILT_IN_PLANTS.find((p) => p.id === 'lavandula-angustifolia')!

describe('plant form', () => {
  it('turns a plant into a draft and back unchanged', () => {
    for (const plant of [tomato, lavender].map(customCopyOf)) {
      expect(fromDraft(toDraft(plant), plant)).toEqual({ plant, errors: null })
    }
  })

  it('shows numbers in the UI language and accepts a decimal comma or point', async () => {
    await i18n.changeLanguage('nl')
    const plant = customCopyOf(lavender)
    const draft = toDraft(plant)
    expect(draft.height).toBe('0,6')
    const result = fromDraft({ ...draft, height: '1,25', spread: '0.8 m' }, plant)
    expect(result.plant).toMatchObject({ heightM: 1.25, spreadM: 0.8 })
  })

  it('reports every field that needs attention', () => {
    const blank = blankCustomPlant()
    const result = fromDraft(
      { ...toDraft(blank), height: '0', spread: 'abc', years: '', sun: [], soil: [] },
      blank,
    )
    expect(result.plant).toBeNull()
    expect([...result.errors!].sort()).toEqual(
      ['height', 'light', 'name', 'soil', 'spread', 'years'].sort(),
    )
  })

  it('keeps the calendar only for vegetables, herbs and fruit', () => {
    const plant = { ...blankCustomPlant(), names: { nl: 'Snijbloem', en: '', latin: '' } }
    const draft = { ...toDraft(plant), harvest: [8, 7], family: ' Asteraceae ' }
    expect(fromDraft(draft, plant).plant?.veg).toBeUndefined()

    const veg = fromDraft({ ...draft, category: 'vegetable' }, plant).plant?.veg
    expect(veg).toEqual({
      sowIndoors: [],
      sowOutdoors: [],
      plantOut: [],
      harvest: [7, 8],
      rowSpacingM: 0.4,
      inRowSpacingM: 0.4,
      family: 'Asteraceae',
    })
    expect(fromDraft({ ...draft, category: 'herb', rowSpacing: '0' }, plant).errors).toEqual(
      new Set(['spacing']),
    )
  })

  it('trims names and drops an empty autumn colour', () => {
    const plant = blankCustomPlant()
    const result = fromDraft(
      { ...toDraft(plant), latin: '  Salvia x  ', autumnColor: null },
      plant,
    ).plant!
    expect(result.names).toEqual({ nl: '', en: '', latin: 'Salvia x' })
    expect('autumnColor' in result).toBe(false)
  })
})
