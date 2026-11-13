import { create } from 'zustand'
import type { Bounds } from '../geometry/bounds'
import type { Size, Viewport } from '../geometry/viewport'
import type { Point } from '../model/schema'

export type Tool = 'select' | 'pan' | 'draw-plot' | 'calibrate'

/** An outline being drawn: the corners placed so far (world metres). */
export type Drawing = { points: Point[] }

/** The site plan being calibrated: the (up to two) points clicked so far (world metres). */
export type Calibration = { points: Point[] }

/**
 * Editor view state that is not part of the design: viewport, selection, active tool, drawing in
 * progress. Kept out of the project store so it never ends up in the undo history or in files.
 */
type UiStore = {
  viewport: Viewport
  /** Size of the canvas in CSS pixels; null until it has been measured. */
  canvasSize: Size | null
  /**
   * The last zoom to fit: the area shown and the viewport that produced. While the viewport is
   * still that one, the canvas fits the area again when its size changes (e.g. a panel below the
   * plan opens), so a fitted view stays fitted until you pan, zoom or click on the plan.
   */
  fit: { bounds: Bounds; viewport: Viewport } | null
  selection: string[]
  tool: Tool
  /** The outline being drawn with the draw tool, or null. */
  drawing: Drawing | null
  /** The line being measured with the calibrate tool, or null. */
  calibration: Calibration | null
  /** Snap to the grid while drawing and dragging corners (off while tracing the site plan). */
  snapToGrid: boolean
  /** Index of the selected plot corner (for deleting it), or null. */
  activeCorner: number | null
  /** World position of the mouse over the canvas, or null when it's elsewhere. */
  cursor: Point | null
  helpOpen: boolean
  rectangleDialogOpen: boolean
  /** The site-plan import dialog (progress, page choice or error) is showing. */
  sitePlanDialogOpen: boolean
  setViewport: (viewport: Viewport | ((current: Viewport) => Viewport)) => void
  setCanvasSize: (size: Size) => void
  setFit: (fit: { bounds: Bounds; viewport: Viewport } | null) => void
  setSelection: (ids: string[]) => void
  /** Adds the id to the selection, or removes it if it was already selected. */
  toggleSelected: (id: string) => void
  /**
   * Switches tools. Starting the draw or calibrate tool begins a new drawing or measurement and
   * clears the selection.
   */
  setTool: (tool: Tool) => void
  setDrawing: (drawing: Drawing | null) => void
  setCalibration: (calibration: Calibration | null) => void
  setSnapToGrid: (on: boolean) => void
  setActiveCorner: (index: number | null) => void
  setCursor: (cursor: Point | null) => void
  setHelpOpen: (open: boolean) => void
  setRectangleDialogOpen: (open: boolean) => void
  setSitePlanDialogOpen: (open: boolean) => void
  /** Back to a clean state, e.g. when another project is opened. */
  reset: () => void
}

const initial = {
  viewport: { x: 0, y: 0, scale: 40 },
  canvasSize: null,
  fit: null,
  selection: [],
  tool: 'select' as Tool,
  drawing: null,
  calibration: null,
  snapToGrid: true,
  activeCorner: null,
  cursor: null,
  helpOpen: false,
  rectangleDialogOpen: false,
  sitePlanDialogOpen: false,
}

export const useUiStore = create<UiStore>()((set) => ({
  ...initial,
  setViewport: (viewport) =>
    set((state) => ({
      viewport: typeof viewport === 'function' ? viewport(state.viewport) : viewport,
    })),
  setCanvasSize: (canvasSize) => set({ canvasSize }),
  setFit: (fit) => set({ fit }),
  setSelection: (selection) => set({ selection, activeCorner: null }),
  toggleSelected: (id) =>
    set((state) => ({
      activeCorner: null,
      selection: state.selection.includes(id)
        ? state.selection.filter((s) => s !== id)
        : [...state.selection, id],
    })),
  setTool: (tool) =>
    set({
      tool,
      drawing: tool === 'draw-plot' ? { points: [] } : null,
      calibration: tool === 'calibrate' ? { points: [] } : null,
      ...(tool === 'draw-plot' || tool === 'calibrate'
        ? { selection: [], activeCorner: null }
        : {}),
    }),
  setDrawing: (drawing) => set({ drawing }),
  setCalibration: (calibration) => set({ calibration }),
  setSnapToGrid: (snapToGrid) => set({ snapToGrid }),
  setActiveCorner: (activeCorner) => set({ activeCorner }),
  setCursor: (cursor) => set({ cursor }),
  setHelpOpen: (helpOpen) => set({ helpOpen }),
  setRectangleDialogOpen: (rectangleDialogOpen) => set({ rectangleDialogOpen }),
  setSitePlanDialogOpen: (sitePlanDialogOpen) => set({ sitePlanDialogOpen }),
  reset: () => set({ ...initial }),
}))
