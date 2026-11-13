import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createProject, listProjects } from '../../persistence/projects'
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
})
