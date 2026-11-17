import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../../App'

// jsdom has no real <canvas>; the plan itself is covered by the Playwright tests.
vi.mock('../canvas/GardenCanvas', () => ({ default: () => null }))
import { addBed } from '../../../model/beds'
import { newProject } from '../../../model/defaults'
import { addObject, shapeForKind } from '../../../model/objects'
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

function design(): Project {
  let project: Project = { ...newProject('Garden', 0), plot: { outline: rect(0, 0, 20, 10) } }
  project = addBed(project, 'bed-ornamental', rect(0, 0, 4, 2)).project
  project = addPlantings(project, 'nepeta-faassenii', [{ x: 1, y: 1 }], 2027).project
  const terrace = addObject(project, 'terrace', shapeForKind('terrace', rect(8, 4, 4, 3))!)
  return terrace.project
}

async function openEditor() {
  const project = design()
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

afterEach(async () => {
  await useProjectStore.getState().close()
})

describe('areas and legend panels', () => {
  it('area totals', async () => {
    const user = await openEditor()
    await user.click(screen.getByRole('button', { name: /^Areas/ }))
    const totals = screen.getByTestId('area-totals')
    expect(within(totals).getByTestId('area-plot')).toHaveTextContent(/200\.0\sm²/)
    expect(within(totals).getByTestId('area-group-beds')).toHaveTextContent(/8\.0\sm²/)
    expect(within(totals).getByTestId('area-group-paved')).toHaveTextContent(/12\.0\sm²/)
  })

  it('legend', async () => {
    const user = await openEditor()
    await user.click(screen.getByRole('button', { name: /^Legend/ }))
    const names = screen.getAllByTestId('legend-entry').map((e) => e.textContent?.trim())
    expect(names.some((n) => n?.includes('Terrace'))).toBe(true)
    expect(names.some((n) => n?.includes('Perennial'))).toBe(true)
  })

  it('area-label toggle is not undoable', async () => {
    const user = await openEditor()
    const before = useProjectStore.getState().past.length
    await user.click(screen.getByTestId('area-labels-toggle'))
    expect(useProjectStore.getState().project?.settings.areaLabels).toBe(true)
    expect(useProjectStore.getState().past.length).toBe(before)
  })
})
