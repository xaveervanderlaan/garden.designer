import type Konva from 'konva'
import { useLayoutEffect, useState } from 'react'

/**
 * Performance (milestone M7): panning and zooming redraw the plan every frame, and Konva redraws a
 * layer's hit graph (the hidden canvas it uses to find the shape under the mouse) with every
 * draw: with 1000 plants that is about 40% of the drawing time. So while the view moves, a
 * layer's hit graph is left as it is, like Konva itself does while something is dragged, and it
 * is redrawn once the view has been still for a moment, or right away when the mouse needs it
 * (call `flush` before pointer events are handled).
 */

/** The hit graph is redrawn this long after the last change of the view. */
export const HIT_GRAPH_SETTLE_MS = 120

export type HitGraphDeferral = {
  /** The view changed: skip hit graph redraws until it has been still for a moment. */
  viewChanged: () => void
  /** Brings the hit graph up to date now, if a redraw was skipped. */
  flush: () => void
  /** Stops deferring and puts the layer's own drawHit back. */
  dispose: () => void
}

/** Defers the hit graph redraws of one layer while the view moves. */
export function deferHitGraph(layer: Konva.Layer): HitGraphDeferral {
  const drawHit = layer.drawHit
  let moving = false
  let stale = false
  let timer: ReturnType<typeof setTimeout> | undefined

  // Only the layer's own hit canvas (no `canvas` argument) is deferred; Konva also draws hit
  // graphs into other canvases, e.g. for cached nodes.
  layer.drawHit = function (this: Konva.Layer, canvas, top) {
    if (moving && !canvas) {
      stale = true
      return this
    }
    if (!canvas) stale = false
    return drawHit.call(this, canvas, top)
  }

  function flush() {
    clearTimeout(timer)
    timer = undefined
    moving = false
    if (stale) layer.drawHit()
  }

  return {
    viewChanged() {
      moving = true
      clearTimeout(timer)
      timer = setTimeout(flush, HIT_GRAPH_SETTLE_MS)
    },
    flush,
    dispose() {
      clearTimeout(timer)
      layer.drawHit = drawHit
    },
  }
}

type HitGraphController = {
  layerRef: (layer: Konva.Layer | null) => void
  viewChanged: () => void
  flush: () => void
}

function createController(): HitGraphController {
  let deferral: HitGraphDeferral | null = null
  return {
    layerRef(layer) {
      deferral?.dispose()
      deferral = layer ? deferHitGraph(layer) : null
    },
    viewChanged: () => deferral?.viewChanged(),
    flush: () => deferral?.flush(),
  }
}

/**
 * Defers the hit graph of a layer while `view` keeps changing (see deferHitGraph). Pass `layerRef` as
 * the layer's ref, and call `flush` before the mouse is used on the plan.
 */
export function useDeferredHitGraph(view: unknown): {
  layerRef: (layer: Konva.Layer | null) => void
  flush: () => void
} {
  const [hitGraph] = useState(createController)

  // In a layout effect: Konva redraws the layer on the next animation frame, after this.
  useLayoutEffect(() => hitGraph.viewChanged(), [view, hitGraph])

  return hitGraph
}
