import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createProject, loadProject } from '../persistence/projects'
import { AUTOSAVE_DELAY_MS, useProjectStore } from './projectStore'

const store = () => useProjectStore.getState()
const rename = (name: string) => store().update((p) => ({ ...p, name }))

describe('projectStore', () => {
  beforeEach(() => {
    // Only fake setTimeout: fake-indexeddb runs on setImmediate, which must stay real.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
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

  it('survives close-then-open in quick succession (React StrictMode)', async () => {
    const project = await createProject('Tuin')
    const closing = store().close()
    const opening = store().open(project.id)
    await Promise.all([closing, opening])

    expect(store().loadState).toBe('ready')
    expect(store().project?.id).toBe(project.id)
  })
})
