import { create } from 'zustand'
import type { Size, Viewport } from '../geometry/viewport'
import type { Point } from '../model/schema'

export type Tool = 'select' | 'pan'

/**
 * Editor view state that is not part of the design: viewport, selection, active tool. Kept out of
 * the project store so it never ends up in the undo history or in saved files.
 */
type UiStore = {
  viewport: Viewport
  /** Size of the canvas in CSS pixels; null until it has been measured. */
  canvasSize: Size | null
  selection: string[]
  tool: Tool
  /** World position of the mouse over the canvas, or null when it's elsewhere. */
  cursor: Point | null
  helpOpen: boolean
  setViewport: (viewport: Viewport | ((current: Viewport) => Viewport)) => void
  setCanvasSize: (size: Size) => void
  setSelection: (ids: string[]) => void
  /** Adds the id to the selection, or removes it if it was already selected. */
  toggleSelected: (id: string) => void
  setTool: (tool: Tool) => void
  setCursor: (cursor: Point | null) => void
  setHelpOpen: (open: boolean) => void
  /** Back to a clean state, e.g. when another project is opened. */
  reset: () => void
}

const initial = {
  viewport: { x: 0, y: 0, scale: 40 },
  canvasSize: null,
  selection: [],
  tool: 'select' as Tool,
  cursor: null,
  helpOpen: false,
}

export const useUiStore = create<UiStore>()((set) => ({
  ...initial,
  setViewport: (viewport) =>
    set((state) => ({
      viewport: typeof viewport === 'function' ? viewport(state.viewport) : viewport,
    })),
  setCanvasSize: (canvasSize) => set({ canvasSize }),
  setSelection: (selection) => set({ selection }),
  toggleSelected: (id) =>
    set((state) => ({
      selection: state.selection.includes(id)
        ? state.selection.filter((s) => s !== id)
        : [...state.selection, id],
    })),
  setTool: (tool) => set({ tool }),
  setCursor: (cursor) => set({ cursor }),
  setHelpOpen: (helpOpen) => set({ helpOpen }),
  reset: () => set({ ...initial }),
}))
