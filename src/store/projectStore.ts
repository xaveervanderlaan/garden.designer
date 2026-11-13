import { create } from 'zustand'
import type { Project } from '../model/schema'
import { loadProject, saveProject } from '../persistence/projects'

export const AUTOSAVE_DELAY_MS = 1000

export type LoadState = 'idle' | 'loading' | 'ready' | 'notFound' | 'error'
/** pending = changed but not yet written; saving = write in progress. */
export type SaveState = 'saved' | 'pending' | 'saving' | 'error'

type ProjectStore = {
  project: Project | null
  loadState: LoadState
  saveState: SaveState
  /** Opens a project for editing (saving any pending changes to the previous one first). */
  open: (id: string) => Promise<void>
  /** Saves pending changes and closes the project. */
  close: () => Promise<void>
  /** Applies a change to the open project; it is saved automatically after a short delay. */
  update: (change: (project: Project) => Project) => void
  /** Writes pending changes now (e.g. when the page is hidden). */
  flush: () => Promise<void>
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
/** Incremented by open/close, so a slow load can't overwrite the result of a later call. */
let generation = 0

export const useProjectStore = create<ProjectStore>()((set, get) => {
  async function save(): Promise<void> {
    saveTimer = undefined
    const project = get().project // read synchronously: the project as it was when the save started
    if (!project) return

    set({ saveState: 'saving' })
    try {
      await saveProject(project)
      if (get().project === project) set({ saveState: 'saved' })
    } catch (error) {
      console.error('Autosave failed', error)
      if (get().project?.id === project.id) set({ saveState: 'error' })
    }
  }

  function flush(): Promise<void> {
    if (saveTimer === undefined) return Promise.resolve()
    clearTimeout(saveTimer)
    return save()
  }

  return {
    project: null,
    loadState: 'idle',
    saveState: 'saved',

    async open(id) {
      const myGeneration = ++generation
      const saving = flush()
      set({ project: null, loadState: 'loading', saveState: 'saved' })
      await saving

      try {
        const project = await loadProject(id)
        if (generation !== myGeneration) return
        set(project ? { project, loadState: 'ready' } : { loadState: 'notFound' })
      } catch (error) {
        console.error('Could not open project', error)
        if (generation === myGeneration) set({ loadState: 'error' })
      }
    },

    async close() {
      const myGeneration = ++generation
      await flush()
      if (generation === myGeneration) set({ project: null, loadState: 'idle', saveState: 'saved' })
    },

    update(change) {
      const project = get().project
      if (!project) return
      set({ project: { ...change(project), updatedAt: Date.now() }, saveState: 'pending' })
      clearTimeout(saveTimer)
      saveTimer = setTimeout(() => void save(), AUTOSAVE_DELAY_MS)
    },

    flush,
  }
})
