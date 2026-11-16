import type Konva from 'konva'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HIT_GRAPH_SETTLE_MS, deferHitGraph } from './hitGraph'

/** Just enough of a Konva layer: drawHit, as on Konva.Layer.prototype. */
function fakeLayer() {
  const drawn: unknown[] = []
  class FakeLayer {
    drawHit(canvas?: unknown) {
      drawn.push(canvas ?? 'own')
      return this
    }
  }
  const layer = new FakeLayer()
  return { layer: layer as unknown as Konva.Layer, drawn }
}

describe('deferHitGraph', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
  afterEach(() => vi.useRealTimers())

  it('draws the hit graph as usual while the view is still', () => {
    const { layer, drawn } = fakeLayer()
    deferHitGraph(layer)
    layer.drawHit()
    expect(drawn).toEqual(['own'])
  })

  it('skips it while the view moves and draws it once the view is still', () => {
    const { layer, drawn } = fakeLayer()
    const deferral = deferHitGraph(layer)
    for (let i = 0; i < 5; i++) {
      deferral.viewChanged()
      layer.drawHit() // the redraw on the next frame
      vi.advanceTimersByTime(HIT_GRAPH_SETTLE_MS / 2)
    }
    expect(drawn).toEqual([])
    vi.advanceTimersByTime(HIT_GRAPH_SETTLE_MS)
    expect(drawn).toEqual(['own'])
  })

  it('draws it right away when flushed, and only when a redraw was skipped', () => {
    const { layer, drawn } = fakeLayer()
    const deferral = deferHitGraph(layer)
    deferral.viewChanged()
    deferral.flush()
    expect(drawn).toEqual([]) // nothing was skipped
    deferral.viewChanged()
    layer.drawHit()
    deferral.flush()
    expect(drawn).toEqual(['own'])
    vi.advanceTimersByTime(HIT_GRAPH_SETTLE_MS)
    expect(drawn).toEqual(['own'])
  })

  it('never skips drawing into another canvas (e.g. for caching)', () => {
    const { layer, drawn } = fakeLayer()
    const deferral = deferHitGraph(layer)
    deferral.viewChanged()
    layer.drawHit('cache' as never)
    expect(drawn).toEqual(['cache'])
  })

  it('puts the layer back as it was when disposed', () => {
    const { layer, drawn } = fakeLayer()
    const deferral = deferHitGraph(layer)
    deferral.viewChanged()
    deferral.dispose()
    layer.drawHit()
    expect(drawn).toEqual(['own'])
    vi.advanceTimersByTime(HIT_GRAPH_SETTLE_MS)
    expect(drawn).toEqual(['own'])
  })
})
