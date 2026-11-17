import { describe, expect, it } from 'vitest'
import { defaultBrief } from '../model/brief'
import type { Brief, MustHave } from '../model/schema'
import { briefChecklist, edgeCoverage, placeHint } from './checklist'
import { emptyPlot, lineObject, planting, polygonObject, rectPoints } from './testProject'

const brief = (b: Partial<Brief>): Brief => ({ ...defaultBrief(), ...b })
const must = (kind: MustHave['kind'], size?: number, place?: string): MustHave => ({
  id: `m-${kind}`,
  kind,
  size,
  place,
})

describe('briefChecklist', () => {
  it('checks presence and size of must-haves', () => {
    const p = emptyPlot()
    p.objects = [polygonObject('t', 'terrace', rectPoints(1, 1, 4, 3))]
    const list = briefChecklist(
      p,
      brief({ mustHaves: [must('terrace', 10), must('terrace', 20), must('pond', 4)] }),
    )
    expect(list.map((i) => i.status)).toEqual(['met', 'partly', 'missing'])
    expect(list[0]).toMatchObject({ found: 12, wanted: 10, unit: 'm2' })
  })

  it('counts vegetable beds and fruit trees', () => {
    const p = emptyPlot()
    p.objects = [
      polygonObject('a', 'bed-vegetable', rectPoints(1, 1, 2, 2)),
      polygonObject('b', 'raised-bed', rectPoints(5, 1, 2, 2)),
    ]
    p.plantings = [
      planting('f', 'vitis-vinifera', 10, 10),
      planting('g', 'achillea-millefolium', 1, 1),
    ]
    const list = briefChecklist(
      p,
      brief({ mustHaves: [must('vegetable-beds', 2), must('fruit-trees', 2)] }),
    )
    expect(list[0]).toMatchObject({ status: 'met', found: 2, unit: 'count' })
    expect(list[1]).toMatchObject({ status: 'partly', found: 1 })
  })

  it('recognises compass and house places', () => {
    expect(placeHint('in the north corner')).toEqual({ side: 'N' })
    expect(placeHint('Zuid, bij het huis')).toEqual({ side: 'S', nearHouse: true })
    const p = emptyPlot()
    p.objects = [
      polygonObject('h', 'house', rectPoints(14, 10, 5, 4)),
      polygonObject('t', 'terrace', rectPoints(9, 10, 4, 4)),
    ]
    const south = briefChecklist(p, brief({ mustHaves: [must('terrace', 10, 'south')] }))[0]
    expect(south).toMatchObject({ place: 'met', status: 'met' })
    const north = briefChecklist(p, brief({ mustHaves: [must('terrace', 10, 'noord')] }))[0]
    expect(north).toMatchObject({ place: 'missed', status: 'partly' })
    const near = briefChecklist(
      p,
      brief({ mustHaves: [must('terrace', 10, 'next to the house')] }),
    )[0]
    expect(near?.place).toBe('met')
    p.settings.northAngleDeg = 180
    const turned = briefChecklist(p, brief({ mustHaves: [must('terrace', 10, 'north')] }))[0]
    expect(turned?.place).toBe('met')
  })

  it('leaves other places unchecked', () => {
    expect(placeHint('somewhere sunny')).toBeNull()
    const p = emptyPlot()
    p.objects = [polygonObject('t', 'terrace', rectPoints(1, 1, 4, 3))]
    const item = briefChecklist(
      p,
      brief({ mustHaves: [must('terrace', 10, 'somewhere sunny')] }),
    )[0]
    expect(item).toMatchObject({ place: 'unchecked', status: 'met' })
  })

  it('measures screening coverage of an edge', () => {
    const p = emptyPlot()
    expect(edgeCoverage(p, 0)).toBe(0)
    p.objects = [
      lineObject('f', 'fence', [
        { x: 0, y: 0.5 },
        { x: 10, y: 0.5 },
      ]),
    ]
    expect(edgeCoverage(p, 0)).toBeGreaterThan(0.45)
    expect(edgeCoverage(p, 0)).toBeLessThan(0.6)
    const list = briefChecklist(p, brief({ screening: [0, 2] }))
    expect(list.map((i) => [i.subject, i.status])).toEqual([
      ['A–B', 'partly'],
      ['C–D', 'missing'],
    ])
  })

  it('flags avoided and toxic plants', () => {
    const p = emptyPlot()
    p.plantings = [planting('a', 'allium-purple-sensation', 3, 3)]
    const list = briefChecklist(
      p,
      brief({
        includePlants: ['achillea-millefolium'],
        avoidPlants: ['allium-purple-sensation'],
        avoidToxic: true,
      }),
    )
    expect(list.map((i) => [i.type, i.status])).toEqual([
      ['include', 'missing'],
      ['avoid', 'missing'],
      ['toxic', 'missing'],
    ])
  })
})
