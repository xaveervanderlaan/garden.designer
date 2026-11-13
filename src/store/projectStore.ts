import { create } from 'zustand'
import type { Project } from '../model/schema'
import { loadProject, pruneUnusedAssets, saveProject } from '../persistence/projects'

export const AUTOSAVE_DELAY_MS = 1000
/** Undo steps kept in memory. Snapshots share unchanged parts, so this is cheap. */
export const HISTORY_LIMIT = 200
/** Updates with the same coalesce key within this time form a single undo step. */
export const COALESCE_WINDOW_MS = 1000

export type LoadState = 'idle' | 'loading' | 'ready' | 'notFound' | 'error'
/** pending = changed but not yet written; saving = write in progress. */
export type SaveState = 'saved' | 'pending' | 'saving' | 'error'

export type UpdateOptions = {
  /** false: not undoable (e.g. layer visibility). Default true. */
  history?: boolean
  /**
   * Consecutive updates with the same key (within COALESCE_WINDOW_MS) become one undo step,
   * e.g. typing in a text field or repeated arrow-key nudges.
   */
  coalesce?: string
}

type ProjectStore = {
  project: Project | null
  loadState: LoadState
  saveState: SaveState
  /** Undo history: earlier versions of the project, most recent last. */
  past: Project[]
  /** Redo history: undone versions, next one first. */
  future: Project[]
  /** Opens a project for editing (saving any pending changes to the previous one first). */
  open: (id: string) => Promise<void>
  /** Saves pending changes and closes the project. */
  close: () => Promise<void>
  /** Applies a change to the open project; it is saved automatically after a short delay. */
  update: (change: (project: Project) => Project, options?: UpdateOptions) => void
  undo: () => void
  redo: () => void
  /** Writes pending changes now (e.g. when the page is hidden). */
  flush: () => Promise<void>
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
/** Incremented by open/close, so a slow load can't overwrite the result of a later call. */
let generation = 0
let lastCoalesce: { key: string; time: number } | null = null

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

  function scheduleSave() {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => void save(), AUTOSAVE_DELAY_MS)
  }

  function flush(): Promise<void> {
    if (saveTimer === undefined) return Promise.resolve()
    clearTimeout(saveTimer)
    return save()
  }

  /** Swaps in a version from the history; view state (layer visibility) stays as it is now. */
  function restore(version: Project, current: Project): Project {
    return { ...version, layers: current.layers, updatedAt: Date.now() }
  }

  return {
    project: null,
    loadState: 'idle',
    saveState: 'saved',
    past: [],
    future: [],

    async open(id) {
      const myGeneration = ++generation
      const saving = flush()
      lastCoalesce = null
      set({ project: null, loadState: 'loading', saveState: 'saved', past: [], future: [] })
      await saving

      try {
        const project = await loadProject(id)
        if (generation !== myGeneration) return
        set(project ? { project, loadState: 'ready' } : { loadState: 'notFound' })
        if (project) void pruneUnusedAssets(project).catch(() => {}) // tidy-up only
      } catch (error) {
        console.error('Could not open project', error)
        if (generation === myGeneration) set({ loadState: 'error' })
      }
    },

    async close() {
      const myGeneration = ++generation
      await flush()
      if (generation === myGeneration) {
        set({ project: null, loadState: 'idle', saveState: 'saved', past: [], future: [] })
      }
    },

    update(change, { history = true, coalesce } = {}) {
      const { project, past, future } = get()
      if (!project) return
      const changed = change(project)
      if (changed === project) return

      const next = { ...changed, updatedAt: Date.now() }
      if (!history) {
        set({ project: next, saveState: 'pending' })
      } else {
        const now = Date.now()
        const merge =
          coalesce !== undefined &&
          lastCoalesce?.key === coalesce &&
          now - lastCoalesce.time < COALESCE_WINDOW_MS &&
          past.length > 0
        lastCoalesce = coalesce === undefined ? null : { key: coalesce, time: now }
        set({
          project: next,
          past: merge ? past : [...past, project].slice(-HISTORY_LIMIT),
          future: future.length ? [] : future,
          saveState: 'pending',
        })
      }
      scheduleSave()
    },

    undo() {
      const { project, past, future } = get()
      const previous = past.at(-1)
      if (!project || !previous) return
      lastCoalesce = null
      set({
        project: restore(previous, project),
        past: past.slice(0, -1),
        future: [project, ...future],
        saveState: 'pending',
      })
      scheduleSave()
    },

    redo() {
      const { project, past, future } = get()
      const next = future[0]
      if (!project || !next) return
      lastCoalesce = null
      set({
        project: restore(next, project),
        past: [...past, project],
        future: future.slice(1),
        saveState: 'pending',
      })
      scheduleSave()
    },

    flush,
  }
})
