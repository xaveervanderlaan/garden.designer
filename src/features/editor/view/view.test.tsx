import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../../App'

// jsdom has no real <canvas>; the plan itself is covered by the Playwright tests.
vi.mock('../canvas/GardenCanvas', () => ({ default: () => null }))
import { addBed } from '../../../model/beds'
import { newProject } from '../../../model/defaults'
import { addPlantings } from '../../../model/plantings'
import type { Point, Project } from '../../../model/schema'
import { db } from '../../../persistence/db'
import { useProjectStore } from '../../../store/projectStore'
import { useUiStore } from '../../../store/uiStore'

const rect = (x: number, y: number, w: number, h: number): Point[] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
]

/**
 * A 20 × 10 m plot with a front border: two lavenders (planted 2027) that overlap once grown and
 * three snowdrops; a field maple outside the border, planted a year later.
 */
function design(): Project {
  let project: Project = {
    ...newProject('Front garden', 0),
    plot: { outline: rect(0, 0, 20, 10) },
  }
  const bed = addBed(project, 'bed-ornamental', rect(0, 0, 6, 3))
  project = { ...bed.project, objects: [{ ...bed.project.objects[0]!, label: 'Front border' }] }
  const plant = (plantId: string, positions: Point[], year: number) => {
    project = addPlantings(project, plantId, positions, year).project
  }
  plant(
    'lavandula-angustifolia',
    [
      { x: 1, y: 1 },
      { x: 1.4, y: 1 },
    ],
    2027,
  )
  plant(
    'galanthus-nivalis',
    [
      { x: 3, y: 1 },
      { x: 3.2, y: 1 },
      { x: 3.4, y: 1 },
    ],
    2027,
  )
  plant('acer-campestre', [{ x: 12, y: 5 }], 2028)
  return project
}

async function openEditor(project = design()) {
  await db.projects.add(project)
  useUiStore.getState().reset()
  render(<App />)
  act(() => {
    window.location.hash = `#/p/${project.id}`
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
  await screen.findByRole('textbox', { name: 'Design name' })
  return userEvent.setup()
}

const viewBar = () => screen.getByRole('group', { name: 'View' })
const warningsPanel = () => screen.getByRole('region', { name: /^Warnings/ })

afterEach(async () => {
  await useProjectStore.getState().close()
  useUiStore.getState().reset()
})

describe('view bar', () => {
  it('shows the plants in a year after planting; overlaps are checked for that year', async () => {
    await openEditor()
    const slider = within(viewBar()).getByRole('slider', { name: 'Year' })
    expect(slider).toHaveAttribute('aria-valuetext', 'Fully grown')
    expect(within(warningsPanel()).getByText('English lavender too close together')).toBeVisible()
    expect(warningsPanel()).toHaveTextContent(/at full size/)

    fireEvent.change(slider, { target: { value: '0' } })
    expect(useUiStore.getState().growthStop).toBe('planting')
    expect(slider).toHaveAttribute('aria-valuetext', 'Planting year (2027)')
    expect(screen.getByTestId('view-year')).toHaveTextContent('Planting year (2027)')
    expect(within(warningsPanel()).queryByText(/too close together/)).not.toBeInTheDocument()
    expect(warningsPanel()).toHaveTextContent(/at their size in 2027/)

    fireEvent.change(slider, { target: { value: '4' } })
    expect(screen.getByTestId('view-year')).toHaveTextContent('2037 (+10 years)')
    expect(within(warningsPanel()).getByText('English lavender too close together')).toBeVisible()
  })

  it('says in which year two plants overlap', async () => {
    const project = design()
    await openEditor(project)
    act(() => {
      useUiStore.getState().setGrowthStop('+5')
      useUiStore.getState().setSelection([project.plantings[0]!.id])
    })
    const properties = screen.getByRole('region', { name: /^Properties/ })
    expect(
      within(properties).getByText(/^Overlaps English lavender by \d+% in 2032\.$/),
    ).toBeVisible()
  })

  it('picks a month, steps through the months and turns it off again', async () => {
    const user = await openEditor()
    const month = within(viewBar()).getByRole('combobox', { name: 'Month' })
    expect(month).toHaveValue('')
    expect(within(month).getByRole('option', { selected: true })).toHaveTextContent('No month')

    await user.selectOptions(month, 'January')
    expect(useUiStore.getState().month).toBe(1)
    await user.click(within(viewBar()).getByRole('button', { name: 'Next month' }))
    expect(month).toHaveValue('2')
    await user.click(within(viewBar()).getByRole('button', { name: 'Previous month' }))
    await user.click(within(viewBar()).getByRole('button', { name: 'Previous month' }))
    expect(month).toHaveValue('12')
    expect(useUiStore.getState().month).toBe(12)

    await user.selectOptions(month, 'No month')
    expect(useUiStore.getState().month).toBeNull()
  })

  it('is not part of the design: no undo step, nothing saved', async () => {
    const user = await openEditor()
    await user.selectOptions(within(viewBar()).getByRole('combobox', { name: 'Month' }), 'May')
    fireEvent.change(within(viewBar()).getByRole('slider'), { target: { value: '2' } })
    expect(useProjectStore.getState().past).toHaveLength(0)
  })
})

describe('bloom chart', () => {
  const chartRows = (dialog: HTMLElement) =>
    within(dialog)
      .getAllByTestId('bloom-row')
      .map((row) => within(row).getByRole('rowheader').textContent)

  /** The months (1–12) a row has a colour chip in. */
  const bloomMonths = (row: HTMLElement) =>
    within(row)
      .getAllByRole('cell')
      .flatMap((cell, i) => (cell.hasAttribute('data-bloom') ? [i + 1] : []))

  it('shows the flowering plants per month, for the design or one bed', async () => {
    const user = await openEditor()
    await user.click(within(viewBar()).getByRole('button', { name: 'Bloom chart' }))
    const dialog = screen.getByRole('dialog', { name: 'Bloom chart' })
    const table = within(dialog).getByRole('table', { name: 'Flowering plants per month' })
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual([
      'Plant',
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ])
    expect(chartRows(dialog)).toEqual(['Snowdrop3×', 'Field maple1×', 'English lavender2×'])
    const [snowdrop, maple, lavender] = within(dialog).getAllByTestId('bloom-row')
    expect(bloomMonths(snowdrop!)).toEqual([1, 2, 3])
    expect(bloomMonths(maple!)).toEqual([4, 5])
    expect(bloomMonths(lavender!)).toEqual([6, 7, 8])
    expect(within(lavender!).getAllByText('purple')).toHaveLength(3)

    // The summary row: how many plants are in bloom, per colour.
    const summary = within(dialog).getAllByTestId('bloom-summary')
    expect(summary[0]).toHaveTextContent('3 plants in bloom, 3 white')
    expect(summary[8]).toHaveTextContent('')
    expect(within(dialog).getByTestId('bloom-chart-hint')).toHaveTextContent(
      'Nothing in bloom in Sep–Dec.',
    )

    // Only the front border.
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Plants in' }), [
      'Front border',
    ])
    expect(chartRows(dialog)).toEqual(['Snowdrop3×', 'English lavender2×'])
    expect(within(dialog).getByTestId('bloom-chart-hint')).toHaveTextContent(
      'Nothing in bloom in Apr–May, Sep–Dec.',
    )

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(within(viewBar()).getByRole('button', { name: 'Bloom chart' })).toHaveFocus()
  })

  it('shows a month on the plan from its column', async () => {
    const user = await openEditor()
    await user.click(within(viewBar()).getByRole('button', { name: 'Bloom chart' }))
    const dialog = screen.getByRole('dialog', { name: 'Bloom chart' })
    const july = within(dialog).getByRole('button', { name: 'Jul' })
    expect(july).toHaveAttribute('title', 'Show July on the plan')
    await user.click(july)
    expect(useUiStore.getState().month).toBe(7)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(within(viewBar()).getByRole('combobox', { name: 'Month' })).toHaveValue('7')
  })

  it('says so when nothing flowers', async () => {
    const project = design()
    const user = await openEditor({
      ...project,
      plantings: project.plantings.filter((p) => p.plantId === 'acer-campestre'),
      objects: [],
    })
    useProjectStore.getState().update((p) => ({ ...p, plantings: [] }))
    await user.click(within(viewBar()).getByRole('button', { name: 'Bloom chart' }))
    const dialog = screen.getByRole('dialog', { name: 'Bloom chart' })
    expect(within(dialog).getByTestId('bloom-chart-empty')).toHaveTextContent(
      'No flowering plants in the design yet.',
    )
    expect(within(dialog).queryByRole('table')).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('is in Dutch too', async () => {
    const user = await openEditor()
    await user.click(screen.getByRole('button', { name: 'NL' }))
    await user.click(
      within(screen.getByRole('group', { name: 'Weergave' })).getByRole('button', {
        name: 'Bloeikalender',
      }),
    )
    const dialog = screen.getByRole('dialog', { name: 'Bloeikalender' })
    expect(within(dialog).getByTestId('bloom-chart-hint')).toHaveTextContent(
      'Niets in bloei in sep–dec.',
    )
    expect(chartRows(dialog)).toEqual(['Sneeuwklokje3×', 'Veldesdoorn1×', 'Lavendel2×'])
  })
})
