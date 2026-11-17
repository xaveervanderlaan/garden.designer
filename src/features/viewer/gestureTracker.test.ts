import { describe, expect, it, vi } from 'vitest'
import type { Viewport } from '../../geometry/viewport'
import type { Point } from '../../model/schema'
import { createGestureTracker } from './gestureTracker'

function setup(initial: Viewport = { x: 0, y: 0, scale: 10 }) {
  let vp = initial
  const onTap = vi.fn<(at: Point) => void>()
  const onGestureStart = vi.fn()
  const tracker = createGestureTracker({
    viewport: () => vp,
    setViewport: (next) => {
      vp = next
    },
    onTap,
    onGestureStart,
  })
  return { tracker, onTap, onGestureStart, viewport: () => vp }
}

describe('gestureTracker', () => {
  it('one finger pans', () => {
    const { tracker, viewport, onGestureStart, onTap } = setup()
    tracker.down(1, { x: 100, y: 100 }, 0)
    tracker.move(1, { x: 104, y: 100 })
    expect(viewport()).toEqual({ x: 0, y: 0, scale: 10 })
    tracker.move(1, { x: 130, y: 120 })
    expect(viewport()).toEqual({ x: 30, y: 20, scale: 10 })
    tracker.move(1, { x: 120, y: 150 })
    expect(viewport()).toEqual({ x: 20, y: 50, scale: 10 })
    tracker.up(1, { x: 120, y: 150 }, 100)
    expect(onGestureStart).toHaveBeenCalledTimes(1)
    expect(onTap).not.toHaveBeenCalled()
  })

  it('two fingers zoom around their midpoint', () => {
    const { tracker, viewport, onGestureStart } = setup()
    tracker.down(1, { x: 100, y: 100 }, 0)
    tracker.down(2, { x: 160, y: 100 }, 10)
    tracker.move(1, { x: 70, y: 100 })
    tracker.move(2, { x: 190, y: 100 })
    // Distance 60 → 120: scale doubles; the world point under (130, 100) stays there.
    expect(viewport()).toEqual({ x: -130, y: -100, scale: 20 })
    expect(onGestureStart).toHaveBeenCalledTimes(1)
  })

  it('lifting one finger of a pinch continues as a pan without a jump', () => {
    const { tracker, viewport, onTap } = setup()
    tracker.down(1, { x: 100, y: 100 }, 0)
    tracker.down(2, { x: 160, y: 100 }, 10)
    tracker.move(2, { x: 220, y: 100 })
    const afterPinch = viewport()
    tracker.up(1, { x: 100, y: 100 }, 50)
    tracker.move(2, { x: 220, y: 100 })
    expect(viewport()).toEqual(afterPinch)
    tracker.move(2, { x: 225, y: 90 })
    expect(viewport()).toEqual({ ...afterPinch, x: afterPinch.x + 5, y: afterPinch.y - 10 })
    tracker.up(2, { x: 225, y: 90 }, 80)
    expect(onTap).not.toHaveBeenCalled()
  })

  it('reports a tap but not a drag or a pinch', () => {
    const { tracker, onTap, onGestureStart, viewport } = setup()
    tracker.down(1, { x: 50, y: 60 }, 0)
    tracker.move(1, { x: 53, y: 62 })
    tracker.up(1, { x: 53, y: 62 }, 120)
    expect(onTap).toHaveBeenCalledExactlyOnceWith({ x: 50, y: 60 })
    expect(onGestureStart).not.toHaveBeenCalled()
    expect(viewport()).toEqual({ x: 0, y: 0, scale: 10 })

    tracker.down(1, { x: 50, y: 60 }, 1000)
    tracker.move(1, { x: 90, y: 60 })
    tracker.up(1, { x: 50, y: 60 }, 1100)

    tracker.down(1, { x: 50, y: 60 }, 2000)
    tracker.down(2, { x: 80, y: 60 }, 2010)
    tracker.up(2, { x: 80, y: 60 }, 2050)
    tracker.up(1, { x: 50, y: 60 }, 2060)

    tracker.down(1, { x: 50, y: 60 }, 3000)
    tracker.cancel(1)

    tracker.down(1, { x: 50, y: 60 }, 4000)
    tracker.up(1, { x: 50, y: 60 }, 4800)
    expect(onTap).toHaveBeenCalledTimes(1)
  })
})
