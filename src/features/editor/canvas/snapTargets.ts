import { type SnapContext, edgesOf } from '../../../geometry/snap'
import { isLayerVisible } from '../../../model/edit'
import { PLOT_LAYER } from '../../../model/plot'
import type { Point, Project } from '../../../model/schema'

type Options = {
  scale: number
  /** Whether to snap to the grid (the toolbar toggle). */
  snapToGrid: boolean
  /** The previous corner while drawing (enables angle snapping). */
  anchor?: Point
  /** Corners of an outline being drawn (an open polyline). */
  drawing?: readonly Point[]
  /** A plot corner being dragged: it and its two edges are not snap targets. */
  excludePlotCorner?: number
}

/** Corners and edges of everything visible that can be snapped to. */
export function snapContext(project: Project, options: Options): SnapContext {
  const vertices: Point[] = []
  const edges: Array<readonly [Point, Point]> = []

  const outline = project.plot.outline
  if (isLayerVisible(project, PLOT_LAYER) && outline.length > 0) {
    const n = outline.length
    const skip = options.excludePlotCorner
    outline.forEach((p, i) => i !== skip && vertices.push(p))
    edgesOf(outline, n >= 3).forEach((edge, i) => {
      if (skip === undefined || (i !== skip && (i + 1) % n !== skip)) edges.push(edge)
    })
  }

  if (options.drawing?.length) {
    vertices.push(...options.drawing)
    edges.push(...edgesOf(options.drawing, false))
  }

  for (const object of project.objects) {
    if (!isLayerVisible(project, object.layer)) continue
    const shape = object.shape
    if (shape.type === 'point') {
      vertices.push(shape.position)
    } else {
      vertices.push(...shape.points)
      edges.push(...edgesOf(shape.points, shape.type === 'polygon'))
    }
  }

  return {
    vertices,
    edges,
    gridSize: project.settings.gridSizeM,
    snapToGrid: options.snapToGrid,
    scale: options.scale,
    anchor: options.anchor,
  }
}
