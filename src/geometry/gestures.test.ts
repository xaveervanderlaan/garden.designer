import { describe, expect, it } from 'vitest'
import { TAP_MAX_MS, TAP_SLOP_PX, isTap, midpoint, pinchViewport } from './gestures'
import { MAX_SCALE, screenToWorld } from './viewport'

describe('gestures', () => {
  it('pinchViewport keeps the world point under the fingers’ midpoint', () => {
    const start = { x: 10, y: 20, scale: 50 }
    const from = [
      { x: 100, y: 200 },
      { x: 160, y: 200 },
    ] as const
    const to = [
      { x: 70, y: 200 },
      { x: 190, y: 200 },
    ] as const
    const vp = pinchViewport(start, from, to)
    expect(vp.scale).toBeCloseTo(100)
    const before = screenToWorld(midpoint(from[0], from[1]), start)
    const after = screenToWorld(midpoint(to[0], to[1]), vp)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it('pinchViewport pans with a moving midpoint and clamps the scale', () => {
    const start = { x: 0, y: 0, scale: 40 }
    const from = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ] as const
    const panned = pinchViewport(start, from, [
      { x: 30, y: 20 },
      { x: 130, y: 20 },
    ])
    expect(panned).toEqual({ x: 30, y: 20, scale: 40 })

    const huge = pinchViewport(start, from, [
      { x: 0, y: 0 },
      { x: 100000, y: 0 },
    ])
    expect(huge.scale).toBe(MAX_SCALE)
  })

  it('isTap allows a little movement and rejects drags and long presses', () => {
    const down = { at: { x: 10, y: 10 }, time: 1000 }
    expect(isTap(down, { at: { x: 16, y: 18 }, time: 1100 })).toBe(true)
    expect(isTap(down, { at: { x: 10 + TAP_SLOP_PX + 1, y: 10 }, time: 1100 })).toBe(false)
    expect(isTap(down, { at: { x: 10, y: 10 }, time: 1000 + TAP_MAX_MS + 1 })).toBe(false)
  })
})
