import { DEFAULT_VIEW_BOUNDS, projectBounds } from '../../geometry/bounds'
import { fitBounds, zoomAt } from '../../geometry/viewport'
import {
  type Clipboard,
  copyItems,
  deleteItems,
  editableItemIds,
  moveItems,
  pasteItems,
  validSelection,
} from '../../model/edit'
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

/** Drops ids from the selection that are no longer valid (after undo, delete, locking, …). */
export function pruneSelection(): void {
  const project = currentProject()
  if (!project) return
  const { selection, setSelection } = ui()
  const valid = validSelection(project, selection)
  if (valid.length !== selection.length) setSelection(valid)
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
  deleteSelection() {
    const ids = currentSelection()
    if (ids.length === 0) return
    useProjectStore.getState().update((p) => deleteItems(p, new Set(ids)))
    ui().setSelection([])
  },
  copy() {
    const project = currentProject()
    const items = project && copyItems(project, new Set(currentSelection()))
    if (items) clipboard = { items, pastes: 0 }
  },
  paste() {
    if (!clipboard || !currentProject()) return
    clipboard.pastes += 1
    paste(clipboard.items, PASTE_OFFSET_M * clipboard.pastes)
  },
  duplicate() {
    const project = currentProject()
    const items = project && copyItems(project, new Set(currentSelection()))
    if (items) paste(items, PASTE_OFFSET_M)
  },
  nudge(dx: number, dy: number) {
    const ids = currentSelection()
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
}
