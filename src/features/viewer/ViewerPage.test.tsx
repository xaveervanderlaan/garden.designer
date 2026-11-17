import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Point } from '../../model/schema'
import { db } from '../../persistence/db'
import { createProject, saveProject } from '../../persistence/projects'
import { samplePlant } from '../../test/fixtures'
import ViewerPage from './ViewerPage'

// jsdom has no <canvas>; the drawing itself is covered by the Playwright tests. The mock taps
// at fixed world points (scale 50 px/m) and shows the selection.
vi.mock('./ViewerPlan', () => ({
  ViewerPlan: ({
    onTap,
    selection,
  }: {
    onTap(world: Point, scale: number): void
    selection: ReadonlySet<string>
  }) => (
    <div data-testid="plan-area" data-selection={[...selection].join(',')}>
      <button type="button" onClick={() => onTap({ x: 2, y: 2 }, 50)}>
        tap plant
      </button>
      <button type="button" onClick={() => onTap({ x: 8, y: 8 }, 50)}>
        tap plot
      </button>
      <button type="button" onClick={() => onTap({ x: 20, y: 20 }, 50)}>
        tap outside
      </button>
    </div>
  ),
}))

describe('ViewerPage', () => {
  it('loads the design and shows no editing tools', async () => {
    const project = await createProject('Back garden')
    const before = (await db.projects.get(project.id))?.updatedAt
    render(<ViewerPage projectId={project.id} />)

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Back garden' }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('plan-area')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to your designs' })).toHaveAttribute('href', '#/')
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', `#/p/${project.id}`)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/pinch to zoom/)
    expect((await db.projects.get(project.id))?.updatedAt).toBe(before)
  })

  it("says when the design doesn't exist", async () => {
    render(<ViewerPage projectId="missing" />)
    expect(
      await screen.findByText(/couldn.t be found|doesn.t exist|not found/i),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /back/i })).toHaveAttribute('href', '#/')
  })

  it('a tap opens the item’s sheet and a tap on nothing closes it', async () => {
    const user = userEvent.setup()
    const created = await createProject('Back garden')
    await saveProject({
      ...created,
      plot: {
        outline: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
          { x: 0, y: 10 },
        ],
      },
      customPlants: [samplePlant],
      plantings: [
        { id: 'p1', plantId: samplePlant.id, position: { x: 2, y: 2 }, plantedYear: 2026 },
      ],
    })
    const before = (await db.projects.get(created.id))?.updatedAt
    render(<ViewerPage projectId={created.id} />)

    await user.click(await screen.findByRole('button', { name: 'tap plant' }))
    expect(screen.getByRole('dialog', { name: 'Lavender' })).toBeInTheDocument()
    expect(screen.getByTestId('plan-area')).toHaveAttribute('data-selection', 'p1')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'tap plot' }))
    expect(screen.getByRole('dialog', { name: 'Plot' })).toBeInTheDocument()
    expect(screen.getByTestId('plan-area')).toHaveAttribute('data-selection', '#plot')

    await user.click(screen.getByRole('button', { name: 'tap outside' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('plan-area')).toHaveAttribute('data-selection', '')

    await user.click(screen.getByRole('button', { name: 'tap plant' }))
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'tap plant' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect((await db.projects.get(created.id))?.updatedAt).toBe(before)
  })

  it('hides a layer without saving the design', async () => {
    const user = userEvent.setup()
    const created = await createProject('Back garden')
    const before = await db.projects.get(created.id)
    render(<ViewerPage projectId={created.id} />)

    await user.click(await screen.findByRole('button', { name: 'Layers' }))
    const dialog = screen.getByRole('dialog', { name: 'Layers' })
    const plants = within(dialog).getByRole('checkbox', { name: 'Beds & plants' })
    expect(plants).toBeChecked()
    expect(within(dialog).queryByRole('checkbox', { name: /Shadows/ })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('checkbox', { name: 'Site plan' })).not.toBeInTheDocument()
    await user.click(plants)
    expect(plants).not.toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await db.projects.get(created.id)).toEqual(before)
  })

  it('shows the vegetable calendar read-only', async () => {
    const user = userEvent.setup()
    const created = await createProject('Back garden')
    render(<ViewerPage projectId={created.id} />)
    await user.click(await screen.findByRole('button', { name: 'Vegetable calendar' }))
    expect(screen.getByRole('dialog', { name: /calendar/i })).toBeInTheDocument()
    expect(screen.getByTestId('veg-calendar-empty')).toBeInTheDocument()
  })
})
