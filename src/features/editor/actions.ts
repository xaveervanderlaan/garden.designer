import {
  type Bounds,
  DEFAULT_VIEW_BOUNDS,
  boundsCentre,
  projectBounds,
} from '../../geometry/bounds'
import { worldToImage } from '../../geometry/calibration'
import { angleDeg, distance, pointAt, roundPoint } from '../../geometry/polygon'
import { fitBounds, screenToWorld, zoomAt } from '../../geometry/viewport'
import {
  BACKGROUND_ID,
  BACKGROUND_LAYER,
  type NewBackground,
  backgroundBounds,
  calibrateBackground,
  moveBackground,
  removeBackground,
  rotateBackground,
  setBackground,
  setBackgroundOpacity,
} from '../../model/background'
import {
  type Clipboard,
  copyItems,
  deleteItems,
  editableItemIds,
  isBackgroundSelected,
  isLayerVisible,
  isPlotSelected,
  moveItems,
  pasteItems,
  setLayerState,
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
import { pickSitePlanFile } from './siteplan/picker'

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

/**
 * The selected items: the selection without the plot (which changes per corner) and the site plan
 * (which has its own commands).
 */
const selectedItems = () =>
  currentSelection().filter((id) => id !== PLOT_ID && id !== BACKGROUND_ID)

const sitePlanSelected = () => {
  const project = currentProject()
  return !!project && isBackgroundSelected(project, ui().selection)
}

/** Shows and unlocks the site plan's layer (not undoable, like the layer buttons). */
function showSitePlanLayer(): void {
  useProjectStore
    .getState()
    .update((p) => setLayerState(p, BACKGROUND_LAYER, { visible: true, locked: false }), {
      history: false,
    })
}

/** Shows `bounds` (and keeps showing it while the canvas resizes, until the view is changed). */
function zoomTo(bounds: Bounds): void {
  const { canvasSize, viewport, setViewport, setFit } = ui()
  const fitted = canvasSize ? fitBounds(bounds, canvasSize) : viewport
  setViewport(fitted)
  setFit({ bounds, viewport: fitted })
}

/** The world point in the middle of the canvas. */
function viewCentre(): Point {
  const { canvasSize, viewport } = ui()
  return canvasSize
    ? screenToWorld({ x: canvasSize.width / 2, y: canvasSize.height / 2 }, viewport)
    : boundsCentre(DEFAULT_VIEW_BOUNDS)
}

/**
 * Drops ids from the selection that are no longer valid (after undo, delete, locking, …), and stops
 * calibrating when the site plan is gone or hidden.
 */
export function pruneSelection(): void {
  const project = currentProject()
  if (!project) return
  if (ui().calibration && !(project.background && isLayerVisible(project, BACKGROUND_LAYER))) {
    ui().setTool('select')
  }
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
  /** Escape: cancel a drawing or calibration in progress, otherwise clear the selection. */
  escape() {
    if (ui().drawing) editorActions.cancelDrawing()
    else if (ui().calibration) editorActions.cancelCalibration()
    else editorActions.clearSelection()
  },
  /**
   * Deletes the selected items, or (with the plot selected) the selected plot corner, or (with the
   * site plan selected) the site plan.
   */
  deleteSelection() {
    const project = currentProject()
    const { activeCorner } = ui()
    if (project && activeCorner !== null && isPlotSelected(project, ui().selection)) {
      editorActions.removeCorner(activeCorner)
      return
    }
    if (sitePlanSelected()) {
      editorActions.removeSitePlan()
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
    if (sitePlanSelected()) {
      useProjectStore
        .getState()
        .update((p) => moveBackground(p, dx, dy), { coalesce: 'nudge:site-plan' })
      return
    }
    const ids = selectedItems()
    if (ids.length === 0) return
    useProjectStore
      .getState()
      .update((p) => moveItems(p, new Set(ids), dx, dy), { coalesce: `nudge:${ids.join(',')}` })
  },
  zoomIn: () => zoomBy(ZOOM_STEP),
  zoomOut: () => zoomBy(1 / ZOOM_STEP),
  /**
   * Shows the whole design: the plot, objects and plants. The site plan only counts when there is
   * nothing else yet, because it often shows much more than the garden.
   */
  zoomToFit() {
    const project = currentProject()
    if (!project) return
    const sitePlan = isLayerVisible(project, BACKGROUND_LAYER) ? backgroundBounds(project) : null
    zoomTo(projectBounds(project) ?? sitePlan ?? DEFAULT_VIEW_BOUNDS)
  },
  /** Once a design is open and the canvas measured: fit it, and set the snapping default. */
  designOpened() {
    const project = currentProject()
    if (!project) return
    // Tracing over a site plan needs corners exactly where you click, not on the grid.
    ui().setSnapToGrid(!(project.background && isLayerVisible(project, BACKGROUND_LAYER)))
    editorActions.zoomToFit()
  },
  setTool(tool: Tool) {
    if (tool === 'calibrate') editorActions.startCalibration()
    else ui().setTool(tool)
  },
  toggleSnapToGrid() {
    ui().setSnapToGrid(!ui().snapToGrid)
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

  // --- Site plan -------------------------------------------------------------------------------

  /** Opens the file picker; the chosen file is read by SitePlanImport. */
  importSitePlan() {
    pickSitePlanFile()
  },
  /**
   * Puts an imported image on the plan (one undo step, replacing any previous one), shows it and
   * starts calibrating its scale.
   */
  placeSitePlan(image: NewBackground) {
    if (!currentProject()) return
    const centre = viewCentre()
    useProjectStore.getState().update((p) => setBackground(p, image, centre))
    showSitePlanLayer()
    ui().setSnapToGrid(false)
    editorActions.startCalibration()
  },
  /** Shows (and unlocks) the site plan and selects it. */
  selectSitePlan() {
    if (!currentProject()?.background) return
    showSitePlanLayer()
    ui().setTool('select')
    ui().setSelection([BACKGROUND_ID])
  },
  /** Locks the site plan, so it can't be moved by accident while tracing. */
  lockSitePlan() {
    useProjectStore
      .getState()
      .update((p) => setLayerState(p, BACKGROUND_LAYER, { locked: true }), { history: false })
    pruneSelection()
  },
  hideSitePlan() {
    useProjectStore
      .getState()
      .update((p) => setLayerState(p, BACKGROUND_LAYER, { visible: false }), { history: false })
    pruneSelection()
  },
  removeSitePlan() {
    useProjectStore.getState().update(removeBackground)
    pruneSelection()
  },
  /** Opacity 0–1; dragging the slider is one undo step. */
  setSitePlanOpacity(opacity: number) {
    useProjectStore
      .getState()
      .update((p) => setBackgroundOpacity(p, opacity), { coalesce: 'site-plan-opacity' })
  },
  /** Turns the site plan about its centre; degrees are map-style (positive = anticlockwise). */
  rotateSitePlan(degrees: number) {
    if (!Number.isFinite(degrees)) return
    useProjectStore.getState().update((p) => rotateBackground(p, degrees))
  },
  /** Shows the whole site plan. */
  zoomToSitePlan() {
    const project = currentProject()
    const bounds = project && backgroundBounds(project)
    if (bounds) zoomTo(bounds)
  },

  // --- Calibrating the site plan's scale -------------------------------------------------------

  startCalibration() {
    if (!currentProject()?.background) return
    showSitePlanLayer()
    ui().setTool('calibrate')
    editorActions.zoomToSitePlan()
  },
  /** Places the start or end of the known distance; a third click starts a new line. */
  addCalibrationPoint(point: Point) {
    const calibration = ui().calibration
    if (!calibration) return
    const points = calibration.points.length >= 2 ? [point] : [...calibration.points, point]
    ui().setCalibration({ points })
  },
  removeLastCalibrationPoint() {
    const calibration = ui().calibration
    if (calibration && calibration.points.length > 0) {
      ui().setCalibration({ points: calibration.points.slice(0, -1) })
    }
  },
  /**
   * Sets the scale so the measured line is `distanceM` long (one undo step), then selects the site
   * plan and shows it whole. False if the line isn't complete or is too short.
   */
  applyCalibration(distanceM: number): boolean {
    const project = currentProject()
    const background = project?.background
    const points = ui().calibration?.points
    if (!project || !background || points?.length !== 2 || !(distanceM > 0)) return false
    const [a, b] = points.map((p) => worldToImage(background, p)) as [Point, Point]
    const calibrated = calibrateBackground(project, a, b, distanceM)
    if (calibrated === project) return false
    useProjectStore.getState().update((p) => calibrateBackground(p, a, b, distanceM))
    ui().setTool('select')
    ui().setSelection([BACKGROUND_ID])
    editorActions.zoomToSitePlan()
    return true
  },
  cancelCalibration() {
    ui().setTool('select')
  },
}
