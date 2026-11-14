import { validSelection } from '../../model/edit'
import {
  blankCustomPlant,
  customCopyOf,
  deleteCustomPlant,
  saveCustomPlant,
} from '../../model/plants'
import type { Plant } from '../../model/schema'
import { useProjectStore } from '../../store/projectStore'
import { useUiStore } from '../../store/uiStore'
import { useLibraryStore } from './libraryStore'

/** Plant library commands, shared by the library panel, the detail card and the plant form. */
export const libraryActions = {
  newCustomPlant(): void {
    useLibraryStore.getState().openForm({ plant: blankCustomPlant(), isNew: true })
  },

  /** Starts a custom plant from a copy of another plant (e.g. for a cultivar). */
  copyAsCustom(plant: Plant): void {
    useLibraryStore.getState().openForm({ plant: customCopyOf(plant), isNew: true })
  },

  editCustomPlant(plant: Plant): void {
    useLibraryStore.getState().openForm({ plant: structuredClone(plant), isNew: false })
  },

  /** Adds or updates a custom plant (one undo step) and shows it in the detail card. */
  saveCustomPlant(plant: Plant): void {
    useProjectStore.getState().update((project) => saveCustomPlant(project, plant))
    const library = useLibraryStore.getState()
    library.closeForm()
    library.showDetail(plant.id)
  },

  /** Removes a custom plant and its plantings (one undo step), back to the list. */
  deleteCustomPlant(plantId: string): void {
    const { update } = useProjectStore.getState()
    update((project) => deleteCustomPlant(project, plantId))
    const project = useProjectStore.getState().project
    const ui = useUiStore.getState()
    if (project) ui.setSelection(validSelection(project, ui.selection))
    useLibraryStore.getState().showDetail(null)
  },
}
