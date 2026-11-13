import { describe, expect, it } from 'vitest'
import {
  MAX_RENDER_AREA_PX,
  MAX_RENDER_SIDE_PX,
  SITE_PLAN_ACCEPT,
  pdfRenderScale,
  sitePlanKind,
} from './sitePlanFile'

describe('sitePlanKind', () => {
  it('recognises PDFs and images by type', () => {
    expect(sitePlanKind({ name: 'plan.pdf', type: 'application/pdf' })).toEqual({ type: 'pdf' })
    expect(sitePlanKind({ name: 'x', type: 'image/jpeg' })).toEqual({
      type: 'image',
      mimeType: 'image/jpeg',
    })
  })

  it('falls back to the extension when the browser gives no type', () => {
    expect(sitePlanKind({ name: 'Plan.PDF', type: '' })).toEqual({ type: 'pdf' })
    expect(sitePlanKind({ name: 'kaart.JPG', type: '' })).toEqual({
      type: 'image',
      mimeType: 'image/jpeg',
    })
  })

  it('refuses anything else', () => {
    expect(sitePlanKind({ name: 'plan.dwg', type: '' })).toBeNull()
    expect(sitePlanKind({ name: 'plan.svg', type: 'image/svg+xml' })).toBeNull()
    expect(sitePlanKind({ name: 'notes.txt', type: 'text/plain' })).toBeNull()
  })

  it('lists the accepted types for the file picker', () => {
    expect(SITE_PLAN_ACCEPT.split(',')).toEqual(
      expect.arrayContaining(['application/pdf', 'image/png', '.jpg', '.pdf']),
    )
  })
})

describe('pdfRenderScale', () => {
  const A4 = { w: 595, h: 842 }
  const A1 = { w: 1684, h: 2384 }

  it('renders small pages at 300 dpi', () => {
    expect(pdfRenderScale(A4.w, A4.h)).toBeCloseTo(300 / 72)
  })

  it('caps large pages at 16 megapixels', () => {
    const scale = pdfRenderScale(A1.w, A1.h)
    expect(A1.w * scale * A1.h * scale).toBeCloseTo(MAX_RENDER_AREA_PX, -3)
    expect(scale).toBeLessThan(300 / 72)
  })

  it('caps very long pages on their longest side', () => {
    const scale = pdfRenderScale(200, 5000)
    expect(5000 * scale).toBeCloseTo(MAX_RENDER_SIDE_PX)
  })
})
