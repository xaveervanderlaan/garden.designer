import { describe, expect, it } from 'vitest'
import { samplePlant } from '../test/fixtures'
import { bloomChart } from './bloomChart'
import { newProject } from './defaults'
import type { Project } from './schema'

/** A design with plantings in two beds and outside them, plus things that don't flower. */
function project(): Project {
  const p = newProject('Bloom', 1_700_000_000_000)
  p.customPlants = [samplePlant] // lavender, purple, Jun–Aug
  const add = (plantId: string, count: number, bedId?: string) => {
    for (let i = 0; i < count; i++) {
      p.plantings.push({
        id: `${plantId}-${bedId ?? 'none'}-${i}`,
        plantId,
        position: { x: i, y: 0 },
        plantedYear: 2027,
        ...(bedId ? { bedId } : {}),
      })
    }
  }
  add(samplePlant.id, 3, 'bed-1')
  add('allium-purple-sensation', 1, 'bed-1') // purple, May–Jun
  add('tulipa-darwin-hybrid-group', 2) // red first, Apr–May
  add('galanthus-nivalis', 1, 'bed-2') // white, Jan–Mar
  add('solanum-lycopersicum', 2, 'bed-2') // no flowers in the data
  add('athyrium-filix-femina', 1, 'bed-2') // a fern: never flowers
  add('custom-deleted', 1, 'bed-1') // unknown plant
  return p
}

describe('bloomChart', () => {
  it('lists flowering species by the start of their bloom, with colours and counts', () => {
    const chart = bloomChart(project(), { lang: 'en' })
    expect(chart.species.map((s) => [s.plant.id, s.count])).toEqual([
      ['galanthus-nivalis', 1],
      ['tulipa-darwin-hybrid-group', 2],
      ['allium-purple-sensation', 1],
      ['custom-lavender', 3],
    ])
    const lavender = chart.species.at(-1)!
    expect(lavender.name).toBe('Lavender')
    expect(lavender.colors).toEqual(['purple'])
    expect(bloomChart(project(), { lang: 'nl' }).species.at(-1)!.name).toBe('Lavendel')
  })

  it('gives per month the species in bloom and the plantings per drawn colour', () => {
    const { months } = bloomChart(project(), { lang: 'en' })
    expect(months.map((m) => m.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    const may = months[4]!
    expect(may.species.map((s) => s.plant.id)).toEqual([
      'tulipa-darwin-hybrid-group',
      'allium-purple-sensation',
    ])
    expect(may.colors).toEqual([
      { color: 'red', count: 2 },
      { color: 'purple', count: 1 },
    ])
    expect(may.count).toBe(3)
    const june = months[5]!
    expect(june.colors).toEqual([{ color: 'purple', count: 4 }])
    expect(months[0]!.colors).toEqual([{ color: 'white', count: 1 }])
  })

  it('lists the months with nothing in bloom', () => {
    expect(bloomChart(project(), { lang: 'en' }).emptyMonths).toEqual([9, 10, 11, 12])
    const empty = newProject('Empty')
    expect(bloomChart(empty, { lang: 'en' }).emptyMonths).toHaveLength(12)
  })

  it('can be limited to one bed', () => {
    const chart = bloomChart(project(), { lang: 'en', bedId: 'bed-1' })
    expect(chart.species.map((s) => s.plant.id)).toEqual([
      'allium-purple-sensation',
      'custom-lavender',
    ])
    expect(chart.emptyMonths).toEqual([1, 2, 3, 4, 9, 10, 11, 12])
    expect(bloomChart(project(), { lang: 'en', bedId: 'nowhere' }).species).toEqual([])
  })
})
