import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createProject, loadProject } from '../persistence/projects'
import {
  AUTOSAVE_DELAY_MS,
  COALESCE_WINDOW_MS,
  HISTORY_LIMIT,
  useProjectStore,
} from './projectStore'

const store = () => useProjectStore.getState()
const rename = (name: string) => store().update((p) => ({ ...p, name }))

describe('projectStore', () => {
  beforeEach(() => {
    // Fake setTimeout and the clock, but not setImmediate: fake-indexeddb runs on it.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  })

  afterEach(async () => {
    await store().close()
    vi.useRealTimers()
  })

  it('opens an existing project', async () => {
    const project = await createProject('Tuin')
    await store().open(project.id)
    expect(store().loadState).toBe('ready')
    expect(store().project).toEqual(project)
  })

  it('reports a missing project', async () => {
    await store().open('does-not-exist')
    expect(store().loadState).toBe('notFound')
    expect(store().project).toBeNull()
  })

  it('saves changes once, after the autosave delay', async () => {
    const project = await createProject('Tuin')
    await store().open(project.id)

    rename('Voortuin')
    rename('Voortuin 2')
    expect(store().saveState).toBe('pending')

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 100)
    expect((await loadProject(project.id))?.name).toBe('Tuin') // debounced: not written yet

    await vi.advanceTimersByTimeAsync(100)
    await vi.waitFor(() => expect(store().saveState).toBe('saved'))
    expect((await loadProject(project.id))?.name).toBe('Voortuin 2')
  })

  it('writes pending changes immediately when closing', async () => {
    const project = await createProject('Tuin')
    await store().open(project.id)
    rename('Moestuin')

    await store().close()

    expect(store().project).toBeNull()
    expect((await loadProject(project.id))?.name).toBe('Moestuin')
  })

  it('saves pending changes to the previous project when opening another', async () => {
    const a = await createProject('A')
    const b = await createProject('B')
    await store().open(a.id)
    rename('A2')

    await store().open(b.id)

    expect(store().project?.id).toBe(b.id)
    expect((await loadProject(a.id))?.name).toBe('A2')
  })

  it('keeps the latest project when opens overlap', async () => {
    const a = await createProject('A')
    const b = await createProject('B')

    const first = store().open(a.id)
    const second = store().open(b.id)
    await Promise.all([first, second])

    expect(store().project?.id).toBe(b.id)
  })

  describe('undo history', () => {
    const name = () => store().project?.name

    it('undoes and redoes changes, and saves the result', async () => {
      const project = await createProject('A')
      await store().open(project.id)
      rename('B')
      rename('C')

      store().undo()
      expect(name()).toBe('B')
      store().undo()
      expect(name()).toBe('A')
      store().undo() // nothing left: no-op
      expect(name()).toBe('A')
      store().redo()
      expect(name()).toBe('B')

      await store().flush()
      expect((await loadProject(project.id))?.name).toBe('B')
    })

    it('clears the redo history on a new change', async () => {
      await store().open((await createProject('A')).id)
      rename('B')
      store().undo()
      rename('C')
      expect(store().future).toHaveLength(0)
      store().redo()
      expect(name()).toBe('C')
    })

    it('merges quick updates with the same coalesce key into one step', async () => {
      await store().open((await createProject('A')).id)
      const type = (n: string) => store().update((p) => ({ ...p, name: n }), { coalesce: 'typing' })
      type('Ab')
      type('Abc')
      expect(store().past).toHaveLength(1)

      await vi.advanceTimersByTimeAsync(COALESCE_WINDOW_MS + 1)
      type('Abcd') // after a pause: a new step
      expect(store().past).toHaveLength(2)

      store().undo()
      expect(name()).toBe('Abc')
      store().undo()
      expect(name()).toBe('A')
    })

    it('keeps non-undoable view changes (layers) out of the history', async () => {
      await store().open((await createProject('A')).id)
      rename('B')
      store().update(
        (p) => ({ ...p, layers: { ...p.layers, labels: { visible: false, locked: false } } }),
        { history: false },
      )
      expect(store().past).toHaveLength(1)

      store().undo()
      expect(name()).toBe('A')
      expect(store().project?.layers.labels.visible).toBe(false) // layer state is kept
    })

    it('ignores updates that change nothing', async () => {
      await store().open((await createProject('A')).id)
      store().update((p) => p)
      expect(store().past).toHaveLength(0)
      expect(store().saveState).toBe('saved')
    })

    it('limits the number of undo steps', async () => {
      await store().open((await createProject('A')).id)
      for (let i = 0; i < HISTORY_LIMIT + 5; i++) rename(`v${i}`)
      expect(store().past).toHaveLength(HISTORY_LIMIT)
    })

    it('starts empty for every opened project', async () => {
      await store().open((await createProject('A')).id)
      rename('B')
      await store().open((await createProject('C')).id)
      expect(store().past).toHaveLength(0)
      expect(store().future).toHaveLength(0)
    })
  })

  it('survives close-then-open in quick succession (React StrictMode)', async () => {
    const project = await createProject('Tuin')
    const closing = store().close()
    const opening = store().open(project.id)
    await Promise.all([closing, opening])

    expect(store().loadState).toBe('ready')
    expect(store().project?.id).toBe(project.id)
  })
})
