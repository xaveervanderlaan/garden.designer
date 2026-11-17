import { describe, expect, it } from 'vitest'
import { flow, listLayout, northArrowShape, pdfText, titleBlockLayout } from './pdfLayout'

describe('pdfLayout', () => {
  it('pdfText keeps Latin-1 and replaces dashes and quotes', () => {
    expect(pdfText('Zaai – oogst “mooi” 5 m² 20°  é…')).toBe('Zaai - oogst "mooi" 5 m² 20°  é...')
    expect(pdfText('≥ ≤ 日')).toBe('>= <= ?')
  })

  it('the north arrow points up for 0° and right for 90°', () => {
    const up = northArrowShape(50, 50, 10, 0)
    expect(up.tip.x).toBeCloseTo(50)
    expect(up.tip.y).toBeCloseTo(40)
    const right = northArrowShape(50, 50, 10, 90)
    expect(right.tip.x).toBeCloseTo(60)
    expect(right.tip.y).toBeCloseTo(50)
  })

  it('the title block keeps its parts inside the block', () => {
    const block = { xMm: 10, yMm: 185, widthMm: 277, heightMm: 15 }
    const l = titleBlockLayout(block)
    const inside = (x: number, y: number) =>
      x >= block.xMm &&
      x <= block.xMm + block.widthMm &&
      y >= block.yMm &&
      y <= block.yMm + block.heightMm
    for (const p of [l.name, ...l.lines]) expect(inside(p.x, p.y)).toBe(true)
    expect(inside(l.scaleBar.xMm, l.scaleBar.yMm)).toBe(true)
    expect(inside(l.scaleBar.xMm + l.scaleBar.maxWidthMm, l.scaleBar.yMm)).toBe(true)
    expect(inside(l.north.cx - l.north.rMm, l.north.cy - l.north.rMm)).toBe(true)
    expect(inside(l.north.cx + l.north.rMm, l.north.cy + l.north.rMm)).toBe(true)
    expect(l.scaleBar.xMm + l.scaleBar.maxWidthMm).toBeLessThan(l.north.cx - l.north.rMm)
  })

  it('flow moves a block that doesn’t fit to the next page', () => {
    const page = { topMm: 10, bottomMm: 100 }
    expect(flow([40, 40, 40], 10, page)).toEqual([
      { page: 0, yMm: 10 },
      { page: 0, yMm: 50 },
      { page: 1, yMm: 10 },
    ])
  })
})

describe('listLayout', () => {
  const page = { widthMm: 210, heightMm: 297 }

  it('puts a short legend and list on one page, legend first', () => {
    const layout = listLayout(5, 4, page)
    expect(layout.pageCount).toBe(1)
    expect(layout.legend.columns).toBe(3)
    expect(layout.table.yMm).toBeGreaterThan(layout.legend.yMm)
    expect(layout.rows).toHaveLength(4)
    expect(layout.total.yMm).toBeGreaterThan(layout.rows[3]!.yMm)
  })

  it('continues the table on further pages when it is long', () => {
    const layout = listLayout(5, 120, page)
    expect(layout.pageCount).toBeGreaterThan(1)
    expect(layout.rows.at(-1)!.page).toBeGreaterThan(0)
    expect(layout.rows.every((r) => r.yMm + 6 <= 297 - 10)).toBe(true)
    expect(layout.total.page).toBe(layout.pageCount - 1)
  })

  it('has no legend block for an empty legend', () => {
    expect(listLayout(0, 2, page).table.yMm).toBe(10)
  })
})
