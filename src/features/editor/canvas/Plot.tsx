import type Konva from 'konva'
import { Line } from 'react-konva'
import type { Viewport } from '../../../geometry/viewport'
import { insertPlotCorner, movePlotCorner } from '../../../model/plot'
import type { Point, Project } from '../../../model/schema'
import { useProjectStore } from '../../../store/projectStore'
import { useUiStore } from '../../../store/uiStore'
import { PLOT_STYLE, SELECTION_COLOR, WARNING_COLOR } from '../../../styles/elementStyles'
import { OutlineOverlay } from './OutlineOverlay'
import { snapContext } from './snapTargets'

const flat = (points: readonly Point[]) => points.flatMap((p) => [p.x, p.y])

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
export function PlotOverlay({ project, ...props }: PlotOverlayProps) {
  const update = useProjectStore((s) => s.update)
  return (
    <OutlineOverlay
      {...props}
      committed={project.plot.outline}
      snapContext={(draggedCorner) =>
        snapContext(project, {
          scale: props.viewport.scale,
          snapToGrid: useUiStore.getState().snapToGrid,
          excludePlotCorner: draggedCorner,
        })
      }
      onMoveCorner={(i, at) => update((p) => movePlotCorner(p, i, at))}
      onInsertCorner={(i, at) => update((p) => insertPlotCorner(p, i, at))}
    />
  )
}
