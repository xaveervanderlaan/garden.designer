import { TAP_SLOP_PX, isTap, pinchViewport } from '../../geometry/gestures'
import { distance } from '../../geometry/polygon'
import { type Viewport, panBy } from '../../geometry/viewport'
import type { Point } from '../../model/schema'

export type GestureCallbacks = {
  viewport(): Viewport
  setViewport(vp: Viewport): void
  onTap(at: Point): void
  /** The first pan or pinch move of a gesture. */
  onGestureStart(): void
}

export type GestureTracker = {
  down(id: number, at: Point, time: number): void
  move(id: number, at: Point): void
  up(id: number, at: Point, time: number): void
  cancel(id: number): void
}

type Pinch = { start: Viewport; from: readonly [Point, Point]; ids: readonly [number, number] }

/**
 * Turns pointer events (container-local screen px) into pans, pinch-zooms and taps. One pointer
 * pans once it has moved further than a tap may; two pointers pinch; more are ignored. A tap is
 * one pointer that barely moved and was released quickly, with no second pointer meanwhile.
 * No DOM: the hook feeds it.
 */
export function createGestureTracker(o: GestureCallbacks): GestureTracker {
  const pointers = new Map<number, Point>()
  let press: { at: Point; time: number } | null = null
  let tapPossible = false
  let panning = false
  let pinch: Pinch | null = null
  let started = false

  function start() {
    if (started) return
    started = true
    o.onGestureStart()
  }

  function startPinch() {
    const [a, b] = [...pointers.entries()]
    if (!a || !b) return
    pinch = { start: o.viewport(), from: [a[1], b[1]], ids: [a[0], b[0]] }
  }

  function release(id: number) {
    pointers.delete(id)
    if (pinch) {
      // The remaining finger continues as a pan from where it is now: no jump.
      pinch = null
      panning = true
    }
    if (pointers.size === 0) {
      press = null
      tapPossible = false
      panning = false
      started = false
    }
  }

  return {
    down(id, at, time) {
      if (pointers.has(id) || pointers.size >= 2) return
      pointers.set(id, at)
      if (pointers.size === 1) {
        press = { at, time }
        tapPossible = true
        panning = false
        started = false
      } else {
        tapPossible = false
        startPinch()
      }
    },

    move(id, at) {
      const last = pointers.get(id)
      if (!last) return
      pointers.set(id, at)
      if (pinch) {
        const [first, second] = pinch.ids
        const a = pointers.get(first)
        const b = pointers.get(second)
        if (!a || !b) return
        start()
        o.setViewport(pinchViewport(pinch.start, pinch.from, [a, b]))
        return
      }
      if (!panning) {
        if (!press || distance(press.at, at) <= TAP_SLOP_PX) return
        panning = true
        tapPossible = false
        // Catch up with the finger from where it went down.
        start()
        o.setViewport(panBy(o.viewport(), at.x - press.at.x, at.y - press.at.y))
        return
      }
      start()
      o.setViewport(panBy(o.viewport(), at.x - last.x, at.y - last.y))
    },

    up(id, at, time) {
      if (!pointers.has(id)) return
      const tap = tapPossible && pointers.size === 1 && press !== null && isTap(press, { at, time })
      const tapAt = press?.at
      release(id)
      if (tap && tapAt) o.onTap(tapAt)
    },

    cancel(id) {
      if (!pointers.has(id)) return
      tapPossible = false
      release(id)
    },
  }
}
