import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import App from '../../App'

// jsdom has no real <canvas>; the plan itself is covered by the Playwright tests.
vi.mock('../editor/canvas/GardenCanvas', () => ({ default: () => null }))
import { createProject } from '../../persistence/projects'
import { useProjectStore } from '../../store/projectStore'
import { useLibraryStore } from './libraryStore'
import { NO_FILTERS } from './search'

async function openEditor() {
  const project = await createProject('Back garden')
  useLibraryStore.setState({ filters: NO_FILTERS, filtersOpen: false, detailId: null, form: null })
  render(<App />)
  act(() => {
    window.location.hash = `#/p/${project.id}`
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
  await screen.findByRole('textbox', { name: 'Design name' })
  return userEvent.setup()
}

const results = () => screen.getByRole('list', { name: 'Plants' })

describe('plant library', () => {
  it('searches across names and opens a plant’s details', async () => {
    const user = await openEditor()
    await user.type(screen.getByRole('searchbox', { name: 'Search plants' }), 'lavendel')

    const first = within(results()).getAllByRole('button')[0]!
    expect(first).toHaveTextContent('English lavender')
    expect(first).toHaveTextContent('Lavandula angustifolia')

    await user.click(first)
    expect(screen.getByRole('heading', { name: 'English lavender' })).toBeInTheDocument()
    expect(screen.getByText('Lavendel')).toBeInTheDocument()
    expect(screen.getByText('Unverified')).toBeInTheDocument()
    // New designs have sandy soil; lavender is drought tolerant and likes sand.
    expect(screen.getByTestId('soil-suitability')).toHaveTextContent('Suits your soil (sand).')
    expect(screen.getByRole('img', { name: 'Flowers: Jun–Aug' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back to the list' }))
    expect(screen.getByRole('searchbox', { name: 'Search plants' })).toHaveValue('lavendel')
  })

  it('filters by category and filter panel, and clears the filters', async () => {
    const user = await openEditor()
    const count = () => Number(screen.getByTestId('library-count').textContent!.replace(/\D/g, ''))
    const all = count()

    await user.click(screen.getByRole('button', { name: 'Trees' }))
    const trees = count()
    expect(trees).toBeLessThan(all)

    await user.click(screen.getByRole('button', { name: 'Filters' }))
    await user.click(screen.getByRole('checkbox', { name: 'Native to the Netherlands' }))
    expect(count()).toBeLessThan(trees)
    expect(screen.getByRole('button', { name: 'Filters (1)' })).toBeInTheDocument()
    expect(within(results()).getByText('Rowan')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(count()).toBe(trees)
  })

  it('creates, edits and deletes a custom plant (undoable)', async () => {
    const user = await openEditor()
    await user.click(screen.getByRole('button', { name: 'New plant' }))

    const dialog = screen.getByRole('dialog', { name: 'New plant' })
    await user.click(within(dialog).getByRole('button', { name: 'Add plant' }))
    expect(within(dialog).getByText('Enter at least one name.')).toBeInTheDocument()

    await user.type(within(dialog).getByLabelText('Dutch name'), 'Tante Annie')
    const height = within(dialog).getByLabelText('Height (m)')
    await user.clear(height)
    await user.type(height, '1,5')
    await user.click(within(dialog).getByRole('button', { name: 'Pink' }))
    await user.click(within(dialog).getByRole('button', { name: 'June' }))
    await user.click(within(dialog).getByRole('button', { name: 'Add plant' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Tante Annie' })).toBeInTheDocument()
    expect(screen.getByText('Own plant')).toBeInTheDocument()
    const stored = useProjectStore.getState().project!.customPlants
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({ heightM: 1.5, flowerColors: ['pink'], bloomMonths: [6] })

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const edit = screen.getByRole('dialog', { name: 'Edit plant' })
    await user.type(within(edit).getByLabelText('English name'), 'Aunt Annie')
    await user.click(within(edit).getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('heading', { name: 'Aunt Annie' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
    )
    expect(useProjectStore.getState().project!.customPlants).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Own plants' }))
    expect(screen.getByText(/No plants of your own yet/)).toBeInTheDocument()

    act(() => useProjectStore.getState().undo())
    expect(within(results()).getByText('Aunt Annie')).toBeInTheDocument()
  })

  it('copies a built-in plant as a custom plant', async () => {
    const user = await openEditor()
    await user.type(screen.getByRole('searchbox', { name: 'Search plants' }), 'Betula pendula')
    await user.click(within(results()).getByRole('button', { name: /Silver birch/ }))
    await user.click(screen.getByRole('button', { name: 'Copy as own plant' }))

    const dialog = screen.getByRole('dialog', { name: 'New plant' })
    expect(within(dialog).getByLabelText('Dutch name')).toHaveValue('Ruwe berk')
    expect(within(dialog).getByLabelText('Height (m)')).toHaveValue('18')
    await user.click(within(dialog).getByRole('button', { name: 'Add plant' }))

    const [copy] = useProjectStore.getState().project!.customPlants
    expect(copy?.id).toMatch(/^custom-/)
    expect(copy?.names.latin).toBe('Betula pendula')
    expect(screen.getByText('Own plant')).toBeInTheDocument()
  })

  it('shows the library in Dutch', async () => {
    const user = await openEditor()
    await user.click(screen.getByRole('button', { name: 'NL' }))
    expect(screen.getByRole('heading', { name: 'Plantenbibliotheek' })).toBeInTheDocument()
    await user.type(screen.getByRole('searchbox', { name: 'Planten zoeken' }), 'english lavender')
    await user.click(
      within(screen.getByRole('list', { name: 'Planten' })).getAllByRole('button')[0]!,
    )
    expect(screen.getByRole('heading', { name: 'Lavendel' })).toBeInTheDocument()
    expect(screen.getByText('Niet gecontroleerd')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Bloei: jun–aug' })).toBeInTheDocument()
  })
})
