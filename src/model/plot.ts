import { boundsOfPoints } from '../geometry/bounds'
import { distance, roundPoint } from '../geometry/polygon'
import type { LayerId, Point, Project } from './schema'

/**
 * The plot boundary. It is selectable like an item (under this id) and belongs to the
 * "existing situation" layer for show/lock purposes.
 */
export const PLOT_ID = '#plot'
export const PLOT_LAYER: LayerId = 'existing'
export const MIN_PLOT_CORNERS = 3

/** Corner names A, B, …, Z, AA, AB, … */
export function cornerLabel(index: number): string {
  let label = ''
  let n = index
  do {
    label = String.fromCharCode(65 + (n % 26)) + label
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return label
}

export function hasPlot(project: Project): boolean {
  return project.plot.outline.length >= MIN_PLOT_CORNERS
}

const withOutline = (project: Project, outline: Point[]): Project => ({
  ...project,
  plot: { ...project.plot, outline: outline.map(roundPoint) },
})

export function setPlotOutline(project: Project, outline: readonly Point[]): Project {
  return withOutline(project, [...outline])
}

/** A width × depth rectangle, placed at the current plot's top-left corner (or the origin). */
export function rectangleOutline(project: Project, width: number, depth: number): Point[] {
  const origin = boundsOfPoints(project.plot.outline)
  const x = origin?.minX ?? 0
  const y = origin?.minY ?? 0
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + depth },
    { x, y: y + depth },
  ]
}

export function movePlotCorner(project: Project, index: number, to: Point): Project {
  return withOutline(
    project,
    project.plot.outline.map((p, i) => (i === index ? to : p)),
  )
}

/** Inserts a corner after `afterIndex` (i.e. on the edge from that corner to the next). */
export function insertPlotCorner(project: Project, afterIndex: number, at: Point): Project {
  const outline = [...project.plot.outline]
  outline.splice(afterIndex + 1, 0, at)
  return withOutline(project, outline)
}

/** Removes a corner; refused (returns the project unchanged) below the minimum of 3. */
export function removePlotCorner(project: Project, index: number): Project {
  if (project.plot.outline.length <= MIN_PLOT_CORNERS) return project
  return withOutline(
    project,
    project.plot.outline.filter((_, i) => i !== index),
  )
}

/**
 * Sets the length of edge `index` (from corner index to the next) by moving the next corner along
 * the edge's direction. The following edge changes accordingly.
 */
export function setPlotEdgeLength(project: Project, index: number, length: number): Project {
  const outline = project.plot.outline
  const n = outline.length
  if (n < 2 || !(length > 0)) return project
  const from = outline[index]!
  const nextIndex = (index + 1) % n
  const to = outline[nextIndex]!
  const current = distance(from, to)
  if (current === 0) return project
  const factor = length / current
  const moved = { x: from.x + (to.x - from.x) * factor, y: from.y + (to.y - from.y) * factor }
  return movePlotCorner(project, nextIndex, moved)
}
