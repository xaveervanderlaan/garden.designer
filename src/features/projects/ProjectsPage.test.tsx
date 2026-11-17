import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { exportProject } from '../../persistence/gardenFile'
import { db } from '../../persistence/db'
import { createProject, listProjects } from '../../persistence/projects'
import { mockPhoneScreen } from '../../test/phone'
import { ProjectsPage } from './ProjectsPage'

const itemFor = async (name: string) =>
  (await screen.findByRole('link', { name })).closest('li') as HTMLElement

describe('ProjectsPage', () => {
  it('creates a design with the suggested name and opens it', async () => {
    const user = userEvent.setup()
    render(<ProjectsPage />)

    await user.click(screen.getByRole('button', { name: 'New design' }))
    const input = screen.getByRole('textbox', { name: 'Name of the new design' })
    expect(input).toHaveValue('My garden')
    await user.click(screen.getByRole('button', { name: 'Create' }))

    const [project] = await listProjects()
    expect(project?.name).toBe('My garden')
    expect(window.location.hash).toBe(`#/p/${project!.id}`)
  })

  it('does not create a design without a name', async () => {
    const user = userEvent.setup()
    render(<ProjectsPage />)

    await user.click(screen.getByRole('button', { name: 'New design' }))
    await user.clear(screen.getByRole('textbox', { name: 'Name of the new design' }))
    await user.click(screen.getByRole('button', { name: 'Create' }))

    expect(screen.getByText('Please enter a name.')).toBeInTheDocument()
    expect(await listProjects()).toHaveLength(0)
  })

  it('renames a design inline', async () => {
    await createProject('Tuin')
    const user = userEvent.setup()
    render(<ProjectsPage />)

    await user.click(within(await itemFor('Tuin')).getByRole('button', { name: 'Rename' }))
    const input = screen.getByRole('textbox', { name: 'New name for “Tuin”' })
    await user.clear(input)
    await user.type(input, 'Voortuin{Enter}')

    expect(await screen.findByRole('link', { name: 'Voortuin' })).toBeInTheDocument()
    expect((await listProjects())[0]?.name).toBe('Voortuin')
  })

  it('only deletes after confirmation', async () => {
    await createProject('Tuin')
    const user = userEvent.setup()
    render(<ProjectsPage />)

    await user.click(within(await itemFor('Tuin')).getByRole('button', { name: 'Delete' }))
    expect(screen.getByText('Delete “Tuin”? This can’t be undone.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await listProjects()).toHaveLength(1)

    await user.click(within(await itemFor('Tuin')).getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText('Deleted “Tuin”.')).toBeInTheDocument()
    expect(await listProjects()).toHaveLength(0)
  })

  it('duplicates a design', async () => {
    await createProject('Tuin')
    const user = userEvent.setup()
    render(<ProjectsPage />)

    await user.click(within(await itemFor('Tuin')).getByRole('button', { name: 'Duplicate' }))

    expect(await screen.findByRole('link', { name: 'Tuin (copy)' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Created a copy: “Tuin (copy)”.')
  })

  it('explains why a file could not be imported', async () => {
    const user = userEvent.setup()
    render(<ProjectsPage />)

    const notADesign = new File(['{"hello": "world"}'], 'other.json', { type: 'application/json' })
    await user.upload(screen.getByTestId('import-input'), notADesign)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This file isn’t a Garden Designer design (.garden.json).',
    )
  })

  it('explains a full storage when importing', async () => {
    const project = await createProject('Tuin')
    const { json } = await exportProject(project.id)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const add = vi
      .spyOn(db.projects, 'add')
      .mockRejectedValueOnce(new DOMException('full', 'QuotaExceededError'))
    const user = userEvent.setup()
    render(<ProjectsPage />)

    await user.upload(
      screen.getByTestId('import-input'),
      new File([json], 'tuin.garden.json', { type: 'application/json' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(/storage is full/)
    expect(screen.getByRole('alert')).toHaveTextContent(/Export backups/)
    add.mockRestore()
    expect(await listProjects()).toHaveLength(1)
    vi.restoreAllMocks()
  })

  it('on a phone hides creating, renaming and duplicating and opens an imported design in the viewer', async () => {
    mockPhoneScreen(true)
    const project = await createProject('Tuin')
    const { json } = await exportProject(project.id)
    const user = userEvent.setup()
    render(<ProjectsPage />)

    expect(await screen.findByRole('link', { name: 'Tuin' })).toHaveAttribute(
      'href',
      `#/v/${project.id}`,
    )
    expect(screen.queryByRole('button', { name: 'New design' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rename' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Duplicate' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument()

    await user.upload(
      screen.getByTestId('import-input'),
      new File([json], 'tuin.garden.json', { type: 'application/json' }),
    )
    const imported = (await listProjects()).find((p) => p.id !== project.id)
    expect(window.location.hash).toBe(`#/v/${imported?.id}`)
  })
})
