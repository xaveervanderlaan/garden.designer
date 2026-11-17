import { describe, expect, it } from 'vitest'
import { compareByFigure, proposalFigures } from './figures'
import { emptyPlot, planting, polygonObject, rectPoints } from './testProject'

describe('proposalFigures', () => {
  it('sums paved, lawn and bed areas', () => {
    const p = emptyPlot()
    p.objects = [
      polygonObject('t', 'terrace', rectPoints(1, 1, 4, 3)),
      polygonObject('l', 'lawn', rectPoints(6, 1, 5, 4)),
      polygonObject('b', 'bed-ornamental', rectPoints(12, 1, 2, 2)),
    ]
    const f = proposalFigures(p)
    expect(f.pavedM2).toBeCloseTo(12)
    expect(f.lawnM2).toBeCloseTo(20)
    expect(f.plantedM2).toBeCloseTo(4)
  })

  it('counts plants, species, native and evergreen shares', () => {
    const p = emptyPlot()
    p.plantings = [
      planting('a', 'achillea-millefolium', 2, 2),
      planting('b', 'achillea-millefolium', 6, 2),
      planting('c', 'pinus-mugo', 12, 8),
      planting('d', 'unknown-plant', 15, 12),
    ]
    const f = proposalFigures(p)
    expect(f.plants).toBe(3)
    expect(f.species).toBe(2)
    expect(f.nativeShare).toBeCloseTo(2 / 3)
    expect(f.evergreenShare).toBeCloseTo(1 / 3)
  })

  it('counts months in bloom', () => {
    const p = emptyPlot()
    p.plantings = [planting('a', 'achillea-millefolium', 2, 2)]
    expect(proposalFigures(p).bloomMonths).toBe(4)
  })

  it('counts warnings, not notices', () => {
    const p = emptyPlot()
    p.plantings = [
      planting('a', 'pinus-mugo', 5, 5),
      planting('b', 'pinus-mugo', 5.2, 5),
      planting('c', 'pinus-mugo', 40, 5),
    ]
    expect(proposalFigures(p).warnings).toBeGreaterThanOrEqual(2)
    expect(proposalFigures(emptyPlot()).warnings).toBe(0)
  })

  it('null shares without plants', () => {
    const f = proposalFigures(emptyPlot())
    expect(f.nativeShare).toBeNull()
    expect(f.evergreenShare).toBeNull()
    const a = { ...f, plants: 3, nativeShare: 0.5 }
    expect(compareByFigure('native')(a, f)).toBeLessThan(0)
    expect(compareByFigure('warnings')({ ...f, warnings: 1 }, f)).toBeGreaterThan(0)
  })
})
