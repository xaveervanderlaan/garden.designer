import { useRef, useState } from 'react'
import { Circle, Group, Rect } from 'react-konva'
import { distance, edgeLengths, signedArea } from '../../../geometry/polygon'
import { type Snap, type SnapContext, snapPoint } from '../../../geometry/snap'
import { type Viewport, screenToWorld, worldToScreen } from '../../../geometry/viewport'
import { formatLength } from '../../../i18n/units'
import { cornerLabel } from '../../../model/plot'
import type { Point } from '../../../model/schema'
import { useUiStore } from '../../../store/uiStore'
import { SELECTION_COLOR } from '../../../styles/elementStyles'
import { edgeLabelPosition } from './labelPosition'
import { HaloText, SnapIndicator } from './overlayShapes'

/** Edges shorter than this on screen get no label or "add corner" dot. */
const MIN_EDGE_PX = 48

export type OutlineOverlayProps = {
  /** The outline to show (a draft while a corner is being dragged). */
  outline: readonly Point[]
  /** The outline as it is stored: the handles are drawn from it. */
  committed: readonly Point[]
  /** False for an open line (a fence, a wall): its last point doesn't connect to the first. */
  closed?: boolean
  viewport: Viewport
  showLabels: boolean
  /** True when the outline is selected and its corners can be edited. */
  editing: boolean
  altHeld: React.RefObject<boolean>
  /** Snap targets while dragging a handle; a dragged corner and its edges must be left out. */
  snapContext: (draggedCorner?: number) => SnapContext
  onDraft: (outline: Point[] | null) => void
  onMoveCorner: (index: number, to: Point) => void
  onInsertCorner: (afterIndex: number, at: Point) => void
}

/**
 * Screen-space extras of an outline (the plot, a bed, an object) or an open line: edge lengths,
 * and while editing, corner handles (A, B, C, …) and a dot on every edge to add a corner.
 */
export function OutlineOverlay({
  outline,
  committed,
  closed = true,
  viewport,
  showLabels,
  editing,
  altHeld,
  snapContext,
  onDraft,
  onMoveCorner,
  onInsertCorner,
}: OutlineOverlayProps) {
  const activeCorner = useUiStore((s) => s.activeCorner)
  const [dragSnap, setDragSnap] = useState<{ snap: Snap; at: Point } | null>(null)
  const lastSnap = useRef<Point | null>(null)
  const base = useRef<readonly Point[]>([])
  const dragged = useRef(false)

  const n = outline.length
  if (n < 2) return null
  const screen = outline.map((p) => worldToScreen(p, viewport))
  const lengths = edgeLengths(outline, closed && n > 2)
  const clockwise = signedArea(outline) > 0
  // Handles follow the committed outline, not the draft: re-rendering a handle while it is being
  // dragged would move it (or, with changing keys, remount it and end the drag).
  const hn = committed.length
  const handles = committed.map((p) => worldToScreen(p, viewport))
  const centre = handles.reduce((c, p) => ({ x: c.x + p.x / hn, y: c.y + p.y / hn }), {
    x: 0,
    y: 0,
  })
  const handleEdges = closed && hn > 2 ? hn : hn - 1

  /** Snaps a dragged handle (screen position) and remembers the world point. */
  function snapHandle(pos: Point, draggedCorner?: number): Point {
    const raw = screenToWorld(pos, viewport)
    const snap: Snap = altHeld.current
      ? { point: raw, kind: null }
      : snapPoint(raw, snapContext(draggedCorner))
    lastSnap.current = snap.point
    const at = worldToScreen(snap.point, viewport)
    setDragSnap({ snap, at })
    return at
  }

  function endDrag(commit: (at: Point) => void) {
    const at = lastSnap.current
    setDragSnap(null)
    onDraft(null)
    if (at) commit(at)
    lastSnap.current = null
  }

  return (
    <Group>
      {showLabels &&
        lengths.map((length, i) => {
          const a = screen[i]!
          const b = screen[(i + 1) % n]!
          if (distance(a, b) < MIN_EDGE_PX) return null
          return (
            <HaloText
              key={`l${i}`}
              at={edgeLabelPosition(a, b, clockwise)}
              text={formatLength(length)}
            />
          )
        })}

      {editing &&
        Array.from({ length: handleEdges }, (_, i) => {
          const a = handles[i]!
          const b = handles[(i + 1) % hn]!
          if (distance(a, b) < MIN_EDGE_PX) return null
          const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
          return (
            <Circle
              key={`m${i}`}
              name="outline-midpoint"
              x={mid.x}
              y={mid.y}
              radius={5}
              fill="#ffffff"
              stroke={SELECTION_COLOR}
              strokeWidth={1.5}
              opacity={0.85}
              draggable
              onMouseDown={(e) => {
                e.cancelBubble = true
                dragged.current = false
              }}
              dragBoundFunc={(pos) => snapHandle(pos)}
              onDragStart={() => {
                dragged.current = true
                base.current = outline
              }}
              onDragMove={() => {
                const at = lastSnap.current
                if (!at) return
                const draft = [...base.current]
                draft.splice(i + 1, 0, at)
                onDraft(draft)
              }}
              onDragEnd={() => {
                endDrag((at) => onInsertCorner(i, at))
                useUiStore.getState().setActiveCorner(i + 1)
              }}
              onClick={() => {
                if (dragged.current) return
                onInsertCorner(i, screenToWorld(mid, viewport))
                useUiStore.getState().setActiveCorner(i + 1)
              }}
            />
          )
        })}

      {editing &&
        handles.map((p, i) => {
          const away = { x: p.x - centre.x, y: p.y - centre.y }
          const length = Math.hypot(away.x, away.y) || 1
          const labelAt = { x: p.x + (away.x / length) * 16, y: p.y + (away.y / length) * 16 }
          const active = activeCorner === i
          return (
            <Group key={`c${i}`}>
              <HaloText at={labelAt} text={cornerLabel(i)} color={SELECTION_COLOR} bold />
              <Rect
                name="outline-corner"
                x={p.x}
                y={p.y}
                width={11}
                height={11}
                offsetX={5.5}
                offsetY={5.5}
                fill={active ? SELECTION_COLOR : '#ffffff'}
                stroke={SELECTION_COLOR}
                strokeWidth={1.5}
                draggable
                onMouseDown={(e) => {
                  e.cancelBubble = true
                  useUiStore.getState().setActiveCorner(i)
                }}
                dragBoundFunc={(pos) => snapHandle(pos, i)}
                onDragStart={() => {
                  base.current = outline
                }}
                onDragMove={() => {
                  const at = lastSnap.current
                  if (at) onDraft(base.current.map((q, j) => (j === i ? at : q)))
                }}
                onDragEnd={() => endDrag((at) => onMoveCorner(i, at))}
              />
            </Group>
          )
        })}

      {dragSnap && <SnapIndicator snap={dragSnap.snap} at={dragSnap.at} />}
    </Group>
  )
}
