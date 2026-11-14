import { create } from 'zustand'
import type { Plant } from '../../model/schema'
import { type LibraryFilters, NO_FILTERS } from './search'

/** A custom plant being created or edited in the plant form. */
export type PlantForm = { plant: Plant; isNew: boolean }

/**
 * View state of the plant library: search, filters, the plant shown in the detail card and the
 * custom-plant form. Not part of the design, so not in the project store or its undo history.
 */
type LibraryStore = {
  filters: LibraryFilters
  filtersOpen: boolean
  /** Id of the plant shown in the detail card; null shows the list. */
  detailId: string | null
  /** Scroll position of the result list, restored when coming back from the detail card. */
  listScrollTop: number
  form: PlantForm | null
  setFilters: (change: Partial<LibraryFilters>) => void
  resetFilters: () => void
  setFiltersOpen: (open: boolean) => void
  showDetail: (id: string | null, listScrollTop?: number) => void
  openForm: (form: PlantForm) => void
  closeForm: () => void
}

export const useLibraryStore = create<LibraryStore>()((set) => ({
  filters: NO_FILTERS,
  filtersOpen: false,
  detailId: null,
  listScrollTop: 0,
  form: null,
  setFilters: (change) => set((state) => ({ filters: { ...state.filters, ...change } })),
  // Keeps the search text and category tab: "clear filters" only clears the filter panel.
  resetFilters: () =>
    set((state) => ({
      filters: { ...NO_FILTERS, query: state.filters.query, category: state.filters.category },
    })),
  setFiltersOpen: (filtersOpen) => set({ filtersOpen }),
  showDetail: (detailId, listScrollTop) =>
    set((state) => ({ detailId, listScrollTop: listScrollTop ?? state.listScrollTop })),
  openForm: (form) => set({ form }),
  closeForm: () => set({ form: null }),
}))

/** Adds or removes a value in a list (for toggle buttons). */
export function toggled<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}
