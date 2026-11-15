import { useLibraryStore } from './libraryStore'

/** Dragging a plant from the library onto the plan (HTML drag and drop). */
export const PLANT_DRAG_TYPE = 'application/x-garden-designer-plant'

/** Props that make an element draggable as a plant. */
export function plantDragProps(plantId: string) {
  return {
    draggable: true,
    onDragStart: (event: React.DragEvent) => {
      event.dataTransfer.setData(PLANT_DRAG_TYPE, plantId)
      event.dataTransfer.effectAllowed = 'copy'
      // The drop target can't read the data while dragging, only on the drop: remember it.
      useLibraryStore.getState().setDragging(plantId)
    },
    onDragEnd: () => useLibraryStore.getState().setDragging(null),
  }
}
