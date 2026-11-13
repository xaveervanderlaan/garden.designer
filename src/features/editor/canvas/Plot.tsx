import type Konva from 'konva'
import { useRef, useState } from 'react'
import { Circle, Group, Line, Rect } from 'react-konva'
import { distance, edgeLengths, signedArea } from '../../../geometry/polygon'
import { type Snap, snapPoint } from '../../../geometry/snap'
import { type Viewport, screenToWorld, worldToScreen } from '../../../geometry/viewport'
import { formatLength } from '../../../i18n/units'
import { cornerLabel, insertPlotCorner, movePlotCorner } from '../../../model/plot'
import type { Point, Project } from '../../../model/schema'
import { useProjectStore } from '../../../store/projectStore'
import { useUiStore } from '../../../store/uiStore'
import { PLOT_STYLE, SELECTION_COLOR, WARNING_COLOR } from '../../../styles/elementStyles'
import { edgeLabelPosition } from './labelPosition'
import { HaloText, SnapIndicator } from './overlayShapes'
import { snapContext } from './snapTargets'

const flat = (points: readonly Point[]) => points.flatMap((p) => [p.x, p.y])
/** Edges shorter than this on screen get no label or "add corner" dot. */
const MIN_EDGE_PX = 48

type PlotShapeProps = {
  outline: readonly Point[]
  selectable: boolean
  selected: boolean
  warning: boolean
  onMouseDown: (event: Konva.KonvaEventObject<MouseEvent>) => void
  onHover: (hovering: boolean) => void
}

/** The plot in world space: a light fill and an outline you can click to select the plot. */
export function PlotShape({
  outline,
  selectable,
  selected,
  warning,
  onMouseDown,
  onHover,
}: PlotShapeProps) {
  if (outline.length < 2) return null
  const closed = outline.length > 2
  const stroke = warning ? WARNING_COLOR : selected ? SELECTION_COLOR : PLOT_STYLE.stroke
  return (
    <>
      <Line
        points={flat(outline)}
        closed={closed}
        fill={PLOT_STYLE.fill}
        listening={false}
        perfectDrawEnabled={false}
      />
      <Line
        points={flat(outline)}
        closed={closed}
        stroke={stroke}
        strokeWidth={selected ? 3 : 2.5}
        strokeScaleEnabled={false}
        hitStrokeWidth={14}
        // Only the line itself is clickable: Konva would otherwise also hit the inside of a closed line.
        fillEnabled={false}
        listening={selectable}
        perfectDrawEnabled={false}
        onMouseDown={onMouseDown}
        onMouseEnter={() => onHover(true)}
        onMouseLeave={() => onHover(false)}
      />
    </>
  )
}

type PlotOverlayProps = {
  project: Project
  /** The outline to show (a draft while a corner is being dragged). */
  outline: readonly Point[]
  viewport: Viewport
  showLabels: boolean
  /** True when the plot is selected and its corners can be edited. */
  editing: boolean
  altHeld: React.RefObject<boolean>
  onDraft: (outline: Point[] | null) => void
}

/** Screen-space plot extras: edge lengths, and corner/edge handles while editing. */
export function PlotOverlay({
  project,
  outline,
  viewport,
  showLabels,
  editing,
  altHeld,
  onDraft,
}: PlotOverlayProps) {
  const activeCorner = useUiStore((s) => s.activeCorner)
  const update = useProjectStore((s) => s.update)
  const [dragSnap, setDragSnap] = useState<{ snap: Snap; at: Point } | null>(null)
  const lastSnap = useRef<Point | null>(null)
  const base = useRef<readonly Point[]>([])
  const dragged = useRef(false)

  const n = outline.length
  if (n < 2) return null
  const screen = outline.map((p) => worldToScreen(p, viewport))
  const lengths = edgeLengths(outline, n > 2)
  const clockwise = signedArea(outline) > 0
  // Handles follow the committed outline, not the draft: re-rendering a handle while it is being
  // dragged would move it (or, with changing keys, remount it and end the drag).
  const committed = project.plot.outline
  const hn = committed.length
  const handles = committed.map((p) => worldToScreen(p, viewport))
  const centre = handles.reduce((c, p) => ({ x: c.x + p.x / hn, y: c.y + p.y / hn }), {
    x: 0,
    y: 0,
  })
  const handleEdges = hn > 2 ? hn : hn - 1

  /** Snaps a dragged handle (screen position) and remembers the world point. */
  function snapHandle(pos: Point, excludeCorner?: number): Point {
    const raw = screenToWorld(pos, viewport)
    const snap: Snap = altHeld.current
      ? { point: raw, kind: null }
      : snapPoint(
          raw,
          snapContext(project, { scale: viewport.scale, excludePlotCorner: excludeCorner }),
        )
    lastSnap.current = snap.point
    const at = worldToScreen(snap.point, viewport)
    setDragSnap({ snap, at })
    return at
  }

  function endDrag(commit: (project: Project, at: Point) => Project) {
    const at = lastSnap.current
    setDragSnap(null)
    onDraft(null)
    if (at) update((p) => commit(p, at))
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
              name="plot-midpoint"
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
                endDrag((p, at) => insertPlotCorner(p, i, at))
                useUiStore.getState().setActiveCorner(i + 1)
              }}
              onClick={() => {
                if (dragged.current) return
                const midWorld = screenToWorld(mid, viewport)
                update((p) => insertPlotCorner(p, i, midWorld))
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
                name="plot-corner"
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
                onDragEnd={() => endDrag((project, at) => movePlotCorner(project, i, at))}
              />
            </Group>
          )
        })}

      {dragSnap && <SnapIndicator snap={dragSnap.snap} at={dragSnap.at} />}
    </Group>
  )
}
