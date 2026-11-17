import { type RefObject, useEffect, useRef } from 'react'
import {
  isTrackpadPan,
  panBy,
  wheelDeltaPx,
  wheelZoomFactor,
  zoomAt,
} from '../../geometry/viewport'
import { type GestureCallbacks, createGestureTracker } from './gestureTracker'

/**
 * Pans, pinch-zooms and taps on the viewer's plan with pointer events (touch, pen and mouse),
 * plus mouse-wheel and trackpad zooming like the editor. The container needs `touch-action: none`.
 */
export function useViewerGestures(
  ref: RefObject<HTMLDivElement | null>,
  callbacks: GestureCallbacks,
): void {
  const latest = useRef(callbacks)
  useEffect(() => {
    latest.current = callbacks
  })

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const tracker = createGestureTracker({
      viewport: () => latest.current.viewport(),
      setViewport: (vp) => latest.current.setViewport(vp),
      onTap: (at) => latest.current.onTap(at),
      onGestureStart: () => latest.current.onGestureStart(),
    })
    const local = (e: { clientX: number; clientY: number }) => {
      const rect = element.getBoundingClientRect()
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      try {
        element.setPointerCapture(e.pointerId)
      } catch {
        // Not capturable (e.g. a synthetic event); the gesture still works inside the plan.
      }
      tracker.down(e.pointerId, local(e), e.timeStamp)
    }
    const onMove = (e: PointerEvent) => tracker.move(e.pointerId, local(e))
    const onUp = (e: PointerEvent) => tracker.up(e.pointerId, local(e), e.timeStamp)
    const onCancel = (e: PointerEvent) => tracker.cancel(e.pointerId)
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const { viewport, setViewport, onGestureStart } = latest.current
      const dx = wheelDeltaPx(e.deltaX, e.deltaMode)
      const dy = wheelDeltaPx(e.deltaY, e.deltaMode)
      onGestureStart()
      setViewport(
        isTrackpadPan(e)
          ? panBy(viewport(), -dx, -dy)
          : zoomAt(viewport(), local(e), wheelZoomFactor(dy, e.ctrlKey)),
      )
    }

    element.addEventListener('pointerdown', onDown)
    element.addEventListener('pointermove', onMove)
    element.addEventListener('pointerup', onUp)
    element.addEventListener('pointercancel', onCancel)
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      element.removeEventListener('pointerdown', onDown)
      element.removeEventListener('pointermove', onMove)
      element.removeEventListener('pointerup', onUp)
      element.removeEventListener('pointercancel', onCancel)
      element.removeEventListener('wheel', onWheel)
    }
  }, [ref])
}
