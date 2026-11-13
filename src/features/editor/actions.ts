import { DEFAULT_VIEW_BOUNDS, projectBounds } from '../../geometry/bounds'
import { angleDeg, distance, pointAt, roundPoint } from '../../geometry/polygon'
import { fitBounds, zoomAt } from '../../geometry/viewport'
import {
  type Clipboard,
  copyItems,
  deleteItems,
  editableItemIds,
  isPlotSelected,
  moveItems,
  pasteItems,
  validSelection,
} from '../../model/edit'
import {
  MIN_PLOT_CORNERS,
  PLOT_ID,
  rectangleOutline,
  removePlotCorner,
  setPlotOutline,
} from '../../model/plot'
import type { Point } from '../../model/schema'
import { useProjectStore } from '../../store/projectStore'
import { type Tool, useUiStore } from '../../store/uiStore'

/**
 * Editor commands, shared by the toolbar, keyboard shortcuts and panels. They read the stores
 * directly, so they can be called from anywhere.
 */

export const NUDGE_SMALL_M = 0.1
export const NUDGE_LARGE_M = 1
export const PASTE_OFFSET_M = 1
export const ZOOM_STEP = 1.25

/** In-app clipboard (works across designs in the same tab). Repeated pastes step further away. */
let clipboard: { items: Clipboard; pastes: number } | null = null

const currentProject = () => useProjectStore.getState().project
const ui = () => useUiStore.getState()

/** The selection, minus items that no longer exist or are on hidden/locked layers. */
export function currentSelection(): string[] {
  const project = currentProject()
  return project ? validSelection(project, ui().selection) : []
}

/** The selected movable items: the selection without the plot (which only changes per corner). */
const selectedItems = () => currentSelection().filter((id) => id !== PLOT_ID)

/** Drops ids from the selection that are no longer valid (after undo, delete, locking, …). */
export function pruneSelection(): void {
  const project = currentProject()
  if (!project) return
  const { selection, setSelection, activeCorner, setActiveCorner } = ui()
  const valid = validSelection(project, selection)
  if (valid.length !== selection.length) setSelection(valid)
  else if (activeCorner !== null && activeCorner >= project.plot.outline.length) {
    setActiveCorner(null)
  }
}

function paste(items: Clipboard, offset: number): void {
  let ids: string[] = []
  useProjectStore.getState().update((project) => {
    const result = pasteItems(project, items, offset, offset)
    ids = result.ids
    return result.project
  })
  ui().setSelection(ids)
}

function zoomBy(factor: number): void {
  const { canvasSize, setViewport } = ui()
  if (!canvasSize) return
  const centre = { x: canvasSize.width / 2, y: canvasSize.height / 2 }
  setViewport((vp) => zoomAt(vp, centre, factor))
}

export const editorActions = {
  undo() {
    useProjectStore.getState().undo()
    pruneSelection()
  },
  redo() {
    useProjectStore.getState().redo()
    pruneSelection()
  },
  selectAll() {
    const project = currentProject()
    if (project) ui().setSelection(editableItemIds(project))
  },
  clearSelection() {
    ui().setSelection([])
  },
  /** Escape: cancel a drawing in progress, otherwise clear the selection. */
  escape() {
    if (ui().drawing) editorActions.cancelDrawing()
    else editorActions.clearSelection()
  },
  /** Deletes the selected items, or (with the plot selected) the selected plot corner. */
  deleteSelection() {
    const project = currentProject()
    const { activeCorner } = ui()
    if (project && activeCorner !== null && isPlotSelected(project, ui().selection)) {
      editorActions.removeCorner(activeCorner)
      return
    }
    const ids = selectedItems()
    if (ids.length === 0) return
    useProjectStore.getState().update((p) => deleteItems(p, new Set(ids)))
    ui().setSelection([])
  },
  copy() {
    const project = currentProject()
    const items = project && copyItems(project, new Set(selectedItems()))
    if (items) clipboard = { items, pastes: 0 }
  },
  paste() {
    if (!clipboard || !currentProject()) return
    clipboard.pastes += 1
    paste(clipboard.items, PASTE_OFFSET_M * clipboard.pastes)
  },
  duplicate() {
    const project = currentProject()
    const items = project && copyItems(project, new Set(selectedItems()))
    if (items) paste(items, PASTE_OFFSET_M)
  },
  nudge(dx: number, dy: number) {
    const ids = selectedItems()
    if (ids.length === 0) return
    useProjectStore
      .getState()
      .update((p) => moveItems(p, new Set(ids), dx, dy), { coalesce: `nudge:${ids.join(',')}` })
  },
  zoomIn: () => zoomBy(ZOOM_STEP),
  zoomOut: () => zoomBy(1 / ZOOM_STEP),
  zoomToFit() {
    const project = currentProject()
    const { canvasSize, setViewport } = ui()
    if (!project || !canvasSize) return
    setViewport(fitBounds(projectBounds(project) ?? DEFAULT_VIEW_BOUNDS, canvasSize))
  },
  setTool(tool: Tool) {
    ui().setTool(tool)
  },

  // --- Plot ------------------------------------------------------------------------------------

  selectPlot() {
    ui().setTool('select')
    ui().setSelection([PLOT_ID])
  },
  removeCorner(index: number) {
    const project = currentProject()
    if (!project || project.plot.outline.length <= MIN_PLOT_CORNERS) return
    useProjectStore.getState().update((p) => removePlotCorner(p, index))
    ui().setActiveCorner(null)
  },
  /** Replaces the plot outline with a width × depth rectangle and shows it. */
  createRectanglePlot(width: number, depth: number) {
    const project = currentProject()
    if (!project || !(width > 0) || !(depth > 0)) return
    useProjectStore.getState().update((p) => setPlotOutline(p, rectangleOutline(p, width, depth)))
    editorActions.selectPlot()
    editorActions.zoomToFit()
  },

  // --- Drawing an outline ----------------------------------------------------------------------

  /** Adds a corner; clicking the first corner again (with 3+ corners) finishes the outline. */
  addDrawingPoint(point: Point) {
    const drawing = ui().drawing
    if (!drawing) return
    const first = drawing.points[0]
    const last = drawing.points.at(-1)
    if (first && drawing.points.length >= MIN_PLOT_CORNERS && distance(first, point) < 1e-6) {
      editorActions.finishDrawing()
      return
    }
    if (last && distance(last, point) < 1e-6) return // double click on the same spot
    ui().setDrawing({ points: [...drawing.points, roundPoint(point)] })
  },
  /**
   * Adds a corner `length` metres from the previous one, in direction `angle` (degrees, 0° = right,
   * 90° = up) or, without an angle, towards `towards` (the cursor). Returns false if not possible.
   */
  addDrawingSegment(length: number, angle: number | undefined, towards: Point | null): boolean {
    const drawing = ui().drawing
    const last = drawing?.points.at(-1)
    if (!drawing || !last || !(length > 0)) return false
    const direction =
      angle ?? (towards && distance(last, towards) > 1e-9 ? angleDeg(last, towards) : 0)
    ui().setDrawing({ points: [...drawing.points, roundPoint(pointAt(last, direction, length))] })
    return true
  },
  removeLastDrawingPoint() {
    const drawing = ui().drawing
    if (drawing && drawing.points.length > 0) {
      ui().setDrawing({ points: drawing.points.slice(0, -1) })
    }
  },
  /** Turns the drawn corners into the plot outline (one undo step). Needs at least 3 corners. */
  finishDrawing(): boolean {
    const drawing = ui().drawing
    if (!drawing || drawing.points.length < MIN_PLOT_CORNERS) return false
    const points = drawing.points
    useProjectStore.getState().update((p) => setPlotOutline(p, points))
    editorActions.selectPlot()
    return true
  },
  cancelDrawing() {
    ui().setTool('select')
  },
}
