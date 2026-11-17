import { act, render, screen, within } from '@testing-library/react'
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

/** Two vegetable beds: lettuce in the first, carrots in the second. */
function design(withCrops = true): Project {
  let project: Project = { ...newProject('Veg', 0), plot: { outline: rect(0, 0, 20, 10) } }
  const first = addBed(project, 'bed-vegetable', rect(0, 0, 4, 2))
  const second = addBed(first.project, 'bed-vegetable', rect(6, 0, 4, 2))
  project = second.project
  if (withCrops) {
    project = addPlantings(project, 'lactuca-sativa', [{ x: 1, y: 1 }], 2027).project
    project = addPlantings(project, 'daucus-carota-subsp-sativus', [{ x: 7, y: 1 }], 2027).project
  }
  return project
}

async function openEditor(project: Project) {
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

const month = (n: number) => screen.getByTestId(`veg-month-${n}`)
const cell = (n: number, activity: string) =>
  month(n).querySelector(`[data-activity="${activity}"]`)?.textContent

afterEach(async () => {
  await useProjectStore.getState().close()
  useUiStore.getState().reset()
})

describe('vegetable calendar', () => {
  it('lists crops per month and activity', async () => {
    const user = await openEditor(design())
    await user.click(screen.getByRole('button', { name: 'Vegetable calendar' }))
    expect(cell(2, 'sowIndoors')).toBe('Lettuce')
    expect(cell(3, 'sowOutdoors')).toBe('Carrot, Lettuce')
    expect(cell(11, 'harvest')).toBe('Carrot')
    expect(within(month(1)).getByText('Nothing to do')).toBeInTheDocument()
  })

  it('filters to one bed', async () => {
    const user = await openEditor(design())
    await user.click(screen.getByRole('button', { name: 'Vegetable calendar' }))
    const bed2 = useProjectStore.getState().project!.objects[1]!.id
    await user.selectOptions(screen.getByRole('combobox', { name: 'Crops in' }), bed2)
    expect(cell(2, 'sowIndoors')).toBeUndefined()
    expect(cell(11, 'harvest')).toBe('Carrot')
  })

  it('opens from bed properties with that bed chosen', async () => {
    const project = design()
    const bed2 = project.objects[1]!.id
    const user = await openEditor(project)
    act(() => useUiStore.getState().setSelection([bed2]))
    // The view bar has one too; the second belongs to the bed's properties.
    const buttons = await screen.findAllByRole('button', { name: 'Vegetable calendar' })
    expect(buttons).toHaveLength(2)
    await user.click(buttons[1]!)
    expect(screen.getByRole('combobox', { name: 'Crops in' })).toHaveValue(bed2)
    expect(cell(11, 'harvest')).toBe('Carrot')
  })

  it('shows an empty hint without crops', async () => {
    const user = await openEditor(design(false))
    await user.click(screen.getByRole('button', { name: 'Vegetable calendar' }))
    expect(screen.getByTestId('veg-calendar-empty')).toBeInTheDocument()
  })
})
