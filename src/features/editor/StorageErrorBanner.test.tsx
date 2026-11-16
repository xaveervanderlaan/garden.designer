import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../persistence/db'
import { createProject } from '../../persistence/projects'
import { useProjectStore } from '../../store/projectStore'
import { downloadTextFile } from '../projects/download'
import { StorageErrorBanner } from './StorageErrorBanner'

vi.mock('../projects/download', () => ({ downloadTextFile: vi.fn() }))

const store = () => useProjectStore.getState()

/** Opens a new design and renames it; the save of that change fails with `error` (if given). */
async function renameWithFailingSave(error?: Error) {
  const project = await createProject('Tuin')
  await store().open(project.id)
  if (error) vi.spyOn(db.projects, 'put').mockRejectedValueOnce(error)
  await act(async () => {
    store().update((p) => ({ ...p, name: 'Voortuin' }))
    await store().flush()
  })
  return store().project!
}

const Banner = () => {
  const project = useProjectStore((s) => s.project)
  return project && <StorageErrorBanner project={project} />
}

describe('StorageErrorBanner', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    vi.mocked(downloadTextFile).mockClear()
    await store().close()
  })

  it('stays hidden while saving works', async () => {
    await renameWithFailingSave()
    render(<Banner />)
    expect(store().saveState).toBe('saved')
    expect(screen.queryByTestId('storage-error')).not.toBeInTheDocument()
  })

  it('advises a backup when the storage is full', async () => {
    await renameWithFailingSave(new DOMException('full', 'QuotaExceededError'))
    render(<Banner />)

    const banner = screen.getByRole('alert')
    expect(banner).toHaveTextContent(/storage is full/)
    expect(banner).toHaveTextContent(/Export a backup now/)
    expect(screen.getByRole('button', { name: 'Export a backup' })).toBeInTheDocument()
  })

  it('exports the design as it is in memory', async () => {
    const project = await renameWithFailingSave(new DOMException('full', 'QuotaExceededError'))
    const user = userEvent.setup()
    render(<Banner />)

    await user.click(screen.getByRole('button', { name: 'Export a backup' }))

    expect(downloadTextFile).toHaveBeenCalledOnce()
    const [fileName, json] = vi.mocked(downloadTextFile).mock.calls[0]!
    expect(fileName).toBe('voortuin.garden.json')
    const file = JSON.parse(json)
    expect(file.project.id).toBe(project.id)
    expect(file.project.name).toBe('Voortuin') // the unsaved change
    expect((await db.projects.get(project.id))?.name).toBe('Tuin')
  })
})
