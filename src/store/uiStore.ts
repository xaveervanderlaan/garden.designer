import { create } from 'zustand'
import type { Size, Viewport } from '../geometry/viewport'
import type { Point } from '../model/schema'

export type Tool = 'select' | 'pan' | 'draw-plot'

/** An outline being drawn: the corners placed so far (world metres). */
export type Drawing = { points: Point[] }

/**
 * Editor view state that is not part of the design: viewport, selection, active tool, drawing in
 * progress. Kept out of the project store so it never ends up in the undo history or in files.
 */
type UiStore = {
  viewport: Viewport
  /** Size of the canvas in CSS pixels; null until it has been measured. */
  canvasSize: Size | null
  selection: string[]
  tool: Tool
  /** The outline being drawn with the draw tool, or null. */
  drawing: Drawing | null
  /** Index of the selected plot corner (for deleting it), or null. */
  activeCorner: number | null
  /** World position of the mouse over the canvas, or null when it's elsewhere. */
  cursor: Point | null
  helpOpen: boolean
  rectangleDialogOpen: boolean
  setViewport: (viewport: Viewport | ((current: Viewport) => Viewport)) => void
  setCanvasSize: (size: Size) => void
  setSelection: (ids: string[]) => void
  /** Adds the id to the selection, or removes it if it was already selected. */
  toggleSelected: (id: string) => void
  /** Switches tools; starting the draw tool begins a new drawing and clears the selection. */
  setTool: (tool: Tool) => void
  setDrawing: (drawing: Drawing | null) => void
  setActiveCorner: (index: number | null) => void
  setCursor: (cursor: Point | null) => void
  setHelpOpen: (open: boolean) => void
  setRectangleDialogOpen: (open: boolean) => void
  /** Back to a clean state, e.g. when another project is opened. */
  reset: () => void
}

const initial = {
  viewport: { x: 0, y: 0, scale: 40 },
  canvasSize: null,
  selection: [],
  tool: 'select' as Tool,
  drawing: null,
  activeCorner: null,
  cursor: null,
  helpOpen: false,
  rectangleDialogOpen: false,
}

export const useUiStore = create<UiStore>()((set) => ({
  ...initial,
  setViewport: (viewport) =>
    set((state) => ({
      viewport: typeof viewport === 'function' ? viewport(state.viewport) : viewport,
    })),
  setCanvasSize: (canvasSize) => set({ canvasSize }),
  setSelection: (selection) => set({ selection, activeCorner: null }),
  toggleSelected: (id) =>
    set((state) => ({
      activeCorner: null,
      selection: state.selection.includes(id)
        ? state.selection.filter((s) => s !== id)
        : [...state.selection, id],
    })),
  setTool: (tool) =>
    set(
      tool === 'draw-plot'
        ? { tool, drawing: { points: [] }, selection: [], activeCorner: null }
        : { tool, drawing: null },
    ),
  setDrawing: (drawing) => set({ drawing }),
  setActiveCorner: (activeCorner) => set({ activeCorner }),
  setCursor: (cursor) => set({ cursor }),
  setHelpOpen: (helpOpen) => set({ helpOpen }),
  setRectangleDialogOpen: (rectangleDialogOpen) => set({ rectangleDialogOpen }),
  reset: () => set({ ...initial }),
}))
