import { describe, expect, it } from 'vitest'
import {
  bestOrientation,
  bestScale,
  boundsSizeM,
  fitsAtScale,
  niceLengthM,
  pageLayout,
  paperSizeMm,
  planAreaM,
  planImageSizePx,
  printedWorldBounds,
  pxPerMetre,
  scaleBar,
} from './scale'

describe('paper and page layout', () => {
  it('turns the paper for landscape', () => {
    expect(paperSizeMm('A4', 'portrait')).toEqual({ widthMm: 210, heightMm: 297 })
    expect(paperSizeMm('A4', 'landscape')).toEqual({ widthMm: 297, heightMm: 210 })
    expect(paperSizeMm('A3', 'landscape')).toEqual({ widthMm: 420, heightMm: 297 })
  })

  it('leaves a margin all round and a title block below the plan', () => {
    const layout = pageLayout('A4', 'landscape')
    expect(layout.plan).toEqual({ xMm: 10, yMm: 10, widthMm: 277, heightMm: 175 })
    expect(layout.titleBlock).toEqual({ xMm: 10, yMm: 185, widthMm: 277, heightMm: 15 })
    expect(layout.titleBlock.yMm + layout.titleBlock.heightMm).toBe(210 - 10)
    expect(pageLayout('A4', 'landscape', { titleBlockHeightMm: 30 }).plan.heightMm).toBe(160)
  })
})

describe('plan area and fit', () => {
  it('holds about 27 × 18 m on A4 landscape at 1:100', () => {
    const area = planAreaM('A4', 'landscape', 100)
    expect(area.widthM).toBeCloseTo(27.7)
    expect(area.heightM).toBeCloseTo(17.5)
    expect(fitsAtScale({ widthM: 27, heightM: 17 }, 'A4', 'landscape', 100)).toBe(true)
    expect(fitsAtScale({ widthM: 27.7, heightM: 17.5 }, 'A4', 'landscape', 100)).toBe(true)
  })

  it('flags a plan that does not fit', () => {
    expect(fitsAtScale({ widthM: 28, heightM: 10 }, 'A4', 'landscape', 100)).toBe(false)
    expect(fitsAtScale({ widthM: 20, heightM: 18 }, 'A4', 'landscape', 100)).toBe(false)
    expect(fitsAtScale({ widthM: 20, heightM: 18 }, 'A4', 'landscape', 200)).toBe(true)
  })

  it('suggests the scale with the most detail that fits', () => {
    expect(bestScale({ widthM: 12, heightM: 8 }, 'A4', 'landscape')).toBe(50)
    expect(bestScale({ widthM: 20, heightM: 15 }, 'A4', 'landscape')).toBe(100)
    expect(bestScale({ widthM: 40, heightM: 30 }, 'A4', 'landscape')).toBe(200)
    expect(bestScale({ widthM: 60, heightM: 40 }, 'A4', 'landscape')).toBeNull()
    expect(bestScale({ widthM: 60, heightM: 40 }, 'A3', 'landscape')).toBe(200)
  })

  it('suggests the orientation that allows the most detail, else the plan’s shape', () => {
    expect(bestOrientation({ widthM: 10, heightM: 20 }, 'A4')).toBe('portrait')
    expect(bestOrientation({ widthM: 20, heightM: 10 }, 'A4')).toBe('landscape')
    expect(bestOrientation({ widthM: 15, heightM: 15 }, 'A4')).toBe('landscape')
    expect(bestOrientation({ widthM: 100, heightM: 300 }, 'A4')).toBe('portrait')
  })

  it('centres the printed part of the world on the plan', () => {
    const bounds = { minX: 0, minY: 0, maxX: 20, maxY: 15 }
    expect(boundsSizeM(bounds)).toEqual({ widthM: 20, heightM: 15 })
    const shown = printedWorldBounds(bounds, pageLayout('A4', 'landscape').plan, 100)
    expect(shown.minX).toBeCloseTo(10 - 13.85)
    expect(shown.maxX).toBeCloseTo(10 + 13.85)
    expect(shown.minY).toBeCloseTo(7.5 - 8.75)
    expect(shown.maxY).toBeCloseTo(7.5 + 8.75)
  })
})

describe('pixels', () => {
  it('renders the plan area at 300 dpi', () => {
    expect(planImageSizePx(pageLayout('A4', 'landscape'))).toEqual({
      widthPx: 3272,
      heightPx: 2067,
    })
    expect(planImageSizePx(pageLayout('A4', 'landscape'), 150)).toEqual({
      widthPx: 1636,
      heightPx: 1033,
    })
  })

  it('gives the pixels per metre on the ground for a scale', () => {
    expect(pxPerMetre(100)).toBeCloseTo((10 / 25.4) * 300) // 1 m = 10 mm at 1:100
    expect(pxPerMetre(50)).toBeCloseTo(2 * pxPerMetre(100))
  })
})

describe('scale bar', () => {
  it('picks 1, 2 or 5 × 10ⁿ metres', () => {
    expect(niceLengthM(4)).toBe(2)
    expect(niceLengthM(5)).toBe(5)
    expect(niceLengthM(0.7)).toBe(0.5)
    expect(niceLengthM(0.03)).toBe(0.02)
    expect(niceLengthM(12)).toBe(10)
    expect(niceLengthM(1000)).toBe(1000)
    expect(niceLengthM(0)).toBe(0)
  })

  it('fits the bar in the space given on paper', () => {
    expect(scaleBar(50, 100)).toEqual({ lengthM: 5, widthMm: 50 })
    expect(scaleBar(40, 200)).toEqual({ lengthM: 5, widthMm: 25 })
    expect(scaleBar(30, 50)).toEqual({ lengthM: 1, widthMm: 20 })
  })
})
