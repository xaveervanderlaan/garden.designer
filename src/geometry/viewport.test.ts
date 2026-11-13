import { describe, expect, it } from 'vitest'
import {
  BASE_SCALE,
  MAX_SCALE,
  MIN_SCALE,
  fitBounds,
  isTrackpadPan,
  panBy,
  screenToWorld,
  visibleBounds,
  wheelDeltaPx,
  wheelZoomFactor,
  worldToScreen,
  zoomAt,
  zoomPercent,
} from './viewport'

const vp = { x: 100, y: 50, scale: 20 }

describe('world ↔ screen', () => {
  it('maps metres to pixels and back', () => {
    expect(worldToScreen({ x: 2, y: 3 }, vp)).toEqual({ x: 140, y: 110 })
    expect(screenToWorld({ x: 140, y: 110 }, vp)).toEqual({ x: 2, y: 3 })
  })
})

describe('zoomAt', () => {
  it('keeps the point under the cursor in place', () => {
    const cursor = { x: 333, y: 222 }
    const before = screenToWorld(cursor, vp)
    const zoomed = zoomAt(vp, cursor, 1.7)
    expect(zoomed.scale).toBeCloseTo(34)
    const after = screenToWorld(cursor, zoomed)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it('stays within the zoom limits', () => {
    expect(zoomAt(vp, { x: 0, y: 0 }, 1e6).scale).toBe(MAX_SCALE)
    expect(zoomAt(vp, { x: 0, y: 0 }, 1e-6).scale).toBe(MIN_SCALE)
  })
})

describe('fitBounds', () => {
  it('fits and centres the bounds within the padding', () => {
    const size = { width: 1000, height: 600 }
    const fitted = fitBounds({ minX: 0, minY: 0, maxX: 20, maxY: 15 }, size, 50)
    // Height is the limit: (600 − 100) / 15
    expect(fitted.scale).toBeCloseTo(500 / 15)
    const centre = worldToScreen({ x: 10, y: 7.5 }, fitted)
    expect(centre.x).toBeCloseTo(500)
    expect(centre.y).toBeCloseTo(300)
  })

  it('copes with zero-size bounds', () => {
    const fitted = fitBounds({ minX: 5, minY: 5, maxX: 5, maxY: 5 }, { width: 800, height: 600 })
    expect(fitted.scale).toBe(MAX_SCALE)
  })
})

describe('helpers', () => {
  it('pans by pixels', () => {
    expect(panBy(vp, 10, -5)).toEqual({ x: 110, y: 45, scale: 20 })
  })

  it('reports 100 % at 1:100 on a 96-dpi screen', () => {
    expect(zoomPercent(BASE_SCALE)).toBe(100)
    expect(zoomPercent(BASE_SCALE * 2.5)).toBe(250)
  })

  it('computes the visible world area', () => {
    expect(visibleBounds(vp, { width: 400, height: 250 })).toEqual({
      minX: -5,
      minY: -2.5,
      maxX: 15,
      maxY: 10,
    })
  })

  it('normalises wheel deltas to pixels', () => {
    expect(wheelDeltaPx(100, 0)).toBe(100)
    expect(wheelDeltaPx(3, 1)).toBe(99)
    expect(wheelDeltaPx(1, 2)).toBe(800)
  })

  it('zooms in on scroll up and out on scroll down', () => {
    expect(wheelZoomFactor(-100, false)).toBeGreaterThan(1)
    expect(wheelZoomFactor(100, false)).toBeLessThan(1)
    expect(wheelZoomFactor(10, true)).toBeLessThan(wheelZoomFactor(10, false))
  })

  it.each([
    [{ deltaX: 0, deltaY: 100, deltaMode: 0, ctrlKey: false, metaKey: false }, false], // mouse wheel
    [{ deltaX: 0, deltaY: 3, deltaMode: 1, ctrlKey: false, metaKey: false }, false], // Firefox lines
    [{ deltaX: 4, deltaY: 12, deltaMode: 0, ctrlKey: false, metaKey: false }, true], // trackpad
    [{ deltaX: 0, deltaY: 6, deltaMode: 0, ctrlKey: true, metaKey: false }, false], // pinch
  ])('classifies %j as trackpad pan: %s', (event, expected) => {
    expect(isTrackpadPan(event)).toBe(expected)
  })
})
