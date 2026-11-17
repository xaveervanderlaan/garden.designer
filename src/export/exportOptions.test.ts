import { describe, expect, it } from 'vitest'
import { DEFAULT_VIEW_BOUNDS } from '../geometry/bounds'
import { worldToScreen } from '../geometry/viewport'
import { BACKGROUND_LAYER, backgroundBounds } from '../model/background'
import { newProject } from '../model/defaults'
import { setLayerState } from '../model/edit'
import { sampleProjectWithAsset } from '../test/fixtures'
import {
  MAX_EXPORT_PIXELS,
  PRINT_LAYOUT_DPI,
  designBounds,
  pdfDefaults,
  pdfFileName,
  pngFileName,
  pngSize,
  printViewport,
  tooManyPixels,
} from './exportOptions'
import { PRINT_DPI, pageLayout, planImageSizePx, printedWorldBounds } from './scale'

describe('export options', () => {
  it('designBounds falls back to the site plan, then the default view', () => {
    const { project } = sampleProjectWithAsset()
    expect(designBounds(project).maxX).toBeGreaterThanOrEqual(20)

    const sitePlanOnly = { ...project, plot: { ...project.plot, outline: [] }, objects: [] }
    const onlyPlan = { ...sitePlanOnly, plantings: [] }
    expect(designBounds(onlyPlan)).toEqual(backgroundBounds(onlyPlan))

    const hidden = setLayerState(onlyPlan, BACKGROUND_LAYER, { visible: false })
    expect(designBounds(hidden)).toEqual(DEFAULT_VIEW_BOUNDS)
    expect(designBounds(newProject('Empty'))).toEqual(DEFAULT_VIEW_BOUNDS)
  })

  it('printViewport maps the printed area onto the 300 dpi plan image', () => {
    const layout = pageLayout('A4', 'landscape')
    const world = printedWorldBounds({ minX: 0, minY: 0, maxX: 20, maxY: 15 }, layout.plan, 100)
    const { viewport, size, pixelRatio } = printViewport(world, layout.plan, 100)

    expect(pixelRatio).toBe(PRINT_DPI / PRINT_LAYOUT_DPI)
    const image = planImageSizePx(layout)
    expect(size.width * pixelRatio).toBeCloseTo(image.widthPx, 6)
    expect(size.height * pixelRatio).toBeCloseTo(image.heightPx, 6)
    // 1 m at 1:100 is 10 mm on paper, at 120 layout dpi.
    expect(viewport.scale).toBeCloseTo((10 / 25.4) * PRINT_LAYOUT_DPI, 9)

    const topLeft = worldToScreen({ x: world.minX, y: world.minY }, viewport)
    expect(topLeft.x).toBeCloseTo(0, 9)
    expect(topLeft.y).toBeCloseTo(0, 9)
    const bottomRight = worldToScreen({ x: world.maxX, y: world.maxY }, viewport)
    expect(bottomRight.x).toBeCloseTo(size.width, 0)
    expect(bottomRight.y).toBeCloseTo(size.height, 0)
  })

  it('pdfDefaults suggests landscape 1:100 for a 20 × 15 m plot on A4', () => {
    const plot = { minX: 0, minY: 0, maxX: 20, maxY: 15 }
    expect(pdfDefaults(plot, 'A4')).toEqual({ orientation: 'landscape', scale: 100, fits: true })
    expect(pdfDefaults({ ...plot, maxY: 12 }, 'A3')).toEqual({
      orientation: 'landscape',
      scale: 50,
      fits: true,
    })
    // Too big for any scale: 1:200, with a warning.
    const huge = { minX: 0, minY: 0, maxX: 200, maxY: 150 }
    expect(pdfDefaults(huge, 'A4')).toMatchObject({ scale: 200, fits: false })
  })

  it('pngSize multiplies the plan area and flags sizes over the cap', () => {
    expect(pngSize({ width: 1200.5, height: 750 }, 2)).toEqual({ widthPx: 2401, heightPx: 1500 })
    expect(pngSize({ width: 333, height: 201 }, 3)).toEqual({ widthPx: 999, heightPx: 603 })
    expect(tooManyPixels({ widthPx: 4096, heightPx: 4096 })).toBe(false)
    expect(tooManyPixels({ widthPx: 4096, heightPx: 4097 })).toBe(true)
    expect(MAX_EXPORT_PIXELS).toBe(4096 * 4096)
  })

  it("file names use the design's slug, paper and scale", () => {
    expect(pdfFileName('Achtertuin – versie 2', 'A4', 100)).toBe('achtertuin-versie-2-a4-1-100.pdf')
    expect(pdfFileName('', 'A3', 50)).toBe('garden-design-a3-1-50.pdf')
    expect(pngFileName('Voortuin')).toBe('voortuin-plan.png')
  })
})
