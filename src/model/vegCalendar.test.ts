import { describe, expect, it } from 'vitest'
import { samplePlant } from '../test/fixtures'
import { newProject } from './defaults'
import type { Project } from './schema'
import { isQuietMonth, vegCalendar } from './vegCalendar'

const TOMATO = 'solanum-lycopersicum' // sow indoors Mar–Apr, plant out May, harvest Jul–Oct
const CARROT = 'daucus-carota-subsp-sativus' // sow outdoors Mar–Jul, harvest Jun–Nov
const LETTUCE = 'lactuca-sativa' // indoors Feb–Apr, outdoors Mar–Aug, out Apr–Aug, harvest May–Oct

/** Three vegetables in two beds, plus an ornamental and an unknown plant (both skipped). */
function project(): Project {
  const p = newProject('Vegetables', 1_700_000_000_000)
  p.customPlants = [samplePlant]
  const add = (plantId: string, count: number, bedId: string) => {
    for (let i = 0; i < count; i++) {
      p.plantings.push({
        id: `${plantId}-${bedId}-${i}`,
        plantId,
        position: { x: i, y: 0 },
        bedId,
        plantedYear: 2027,
      })
    }
  }
  add(TOMATO, 2, 'veg-1')
  add(CARROT, 10, 'veg-1')
  add(LETTUCE, 6, 'veg-2')
  add(samplePlant.id, 1, 'veg-2')
  add('custom-deleted', 1, 'veg-1')
  return p
}

const ids = (crops: { plant: { id: string } }[]) => crops.map((crop) => crop.plant.id)

describe('vegCalendar', () => {
  it('lists the edible crops, sorted by name in the language, with counts', () => {
    const en = vegCalendar(project(), { lang: 'en' })
    expect(en.crops.map((c) => [c.name, c.count])).toEqual([
      ['Carrot', 10],
      ['Lettuce', 6],
      ['Tomato', 2],
    ])
    const nl = vegCalendar(project(), { lang: 'nl' })
    expect(nl.crops.map((c) => c.name)).toEqual(['Kropsla', 'Tomaat', 'Wortel'])
  })

  it('puts every crop in the right months', () => {
    const { months } = vegCalendar(project(), { lang: 'en' })
    const month = (m: number) => months[m - 1]!
    expect(ids(month(2).sowIndoors)).toEqual([LETTUCE])
    expect(ids(month(3).sowIndoors)).toEqual([LETTUCE, TOMATO])
    expect(ids(month(3).sowOutdoors)).toEqual([CARROT, LETTUCE])
    expect(ids(month(5).plantOut)).toEqual([LETTUCE, TOMATO])
    expect(ids(month(6).harvest)).toEqual([CARROT, LETTUCE])
    expect(ids(month(7).harvest)).toEqual([CARROT, LETTUCE, TOMATO])
    expect(ids(month(11).harvest)).toEqual([CARROT])
    expect(isQuietMonth(month(12))).toBe(true)
    expect(isQuietMonth(month(1))).toBe(true)
    expect(isQuietMonth(month(11))).toBe(false)
  })

  it('can be limited to one bed', () => {
    const calendar = vegCalendar(project(), { lang: 'en', bedId: 'veg-2' })
    expect(ids(calendar.crops)).toEqual([LETTUCE])
    expect(ids(calendar.months[2]!.sowIndoors)).toEqual([LETTUCE])
    expect(calendar.months[6]!.harvest.map((c) => c.count)).toEqual([6])
  })

  it('is empty for a design without edible plants', () => {
    const calendar = vegCalendar(newProject('Empty'), { lang: 'en' })
    expect(calendar.crops).toEqual([])
    expect(calendar.months.every(isQuietMonth)).toBe(true)
  })
})
