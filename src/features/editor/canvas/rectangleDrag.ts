import { useEffect, useRef, useState } from 'react'
import { rectangleFromCorners } from '../../../geometry/frame'
import type { Point } from '../../../model/schema'
import { useUiStore } from '../../../store/uiStore'
import { drawsRectangles, editorActions } from '../actions'

/** The mouse must move this far (screen pixels) before a press becomes a dragged rectangle. */
const DRAG_THRESHOLD_PX = 5

/**
 * Drawing an outline (a bed, a building) by dragging a rectangle: pressing on the plan before the
 * first corner is placed starts it. Released without moving, it was a click, which places the
 * first corner of a free outline instead.
 */
export function useRectangleDrag(snap: (screen: Point, alt: boolean) => Point) {
  const [draft, setDraft] = useState<Point[] | null>(null)
  const snapRef = useRef(snap)
  useEffect(() => {
    snapRef.current = snap
  })

  /**
   * Called on a press while drawing, with the stage position and its snapped world point. Returns
   * false when a rectangle can't start here (the press is then an ordinary click).
   */
  function start(event: MouseEvent, pointer: Point, point: Point): boolean {
    const drawing = useUiStore.getState().drawing
    if (!drawing || drawing.points.length > 0 || !drawsRectangles(drawing.target)) return false
    // Window events give client coordinates; the stage's are relative to its corner.
    const origin = { x: event.clientX - pointer.x, y: event.clientY - pointer.y }
    let end: Point | null = null
    const onMove = (e: MouseEvent) => {
      const screen = { x: e.clientX - origin.x, y: e.clientY - origin.y }
      if (!end && Math.hypot(screen.x - pointer.x, screen.y - pointer.y) < DRAG_THRESHOLD_PX) return
      end = snapRef.current(screen, e.altKey)
      setDraft(rectangleFromCorners(point, end))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      setDraft(null)
      if (end && editorActions.drawRectangle(point, end)) return
      editorActions.addDrawingPoint(point)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return true
  }

  return { draft, start }
}
