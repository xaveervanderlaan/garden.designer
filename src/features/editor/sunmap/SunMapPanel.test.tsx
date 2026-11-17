import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../../App'

// jsdom has no real <canvas>; the plan itself is covered by the Playwright tests.
vi.mock('../canvas/GardenCanvas', () => ({ default: () => null }))
import { computeSunHours, type SunHoursResult } from '../../../geometry/sunHours'
import { newProject } from '../../../model/defaults'
import { addObject } from '../../../model/objects'
import type { Project } from '../../../model/schema'
import { db } from '../../../persistence/db'
import { useProjectStore } from '../../../store/projectStore'
import { resetSunMap, useSunMapStore } from '../../../store/sunMapStore'
import { useUiStore } from '../../../store/uiStore'
import { setSunHoursClientForTests } from './sunMapActions'

const plot = [
  { x: 0, y: 0 },
  { x: 6, y: 0 },
  { x: 6, y: 6 },
  { x: 0, y: 6 },
]

async function openEditor() {
  const project: Project = { ...newProject('Sunny', 0), plot: { outline: plot } }
  await db.projects.add(project)
  useUiStore.getState().reset()
  render(<App />)
  act(() => {
    window.location.hash = `#/p/${project.id}`
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
  await screen.findByRole('textbox', { name: 'Design name' })
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: /Sun hours/ }))
  return user
}

const realClient = {
  compute: async (input: Parameters<typeof computeSunHours>[0]) =>
    computeSunHours(input) as SunHoursResult,
  dispose() {},
}

afterEach(async () => {
  setSunHoursClientForTests(null)
  resetSunMap()
  await useProjectStore.getState().close()
  useUiStore.getState().reset()
})

describe('sun-hours panel', () => {
  it('computes the growing-season map and shows the legend', async () => {
    setSunHoursClientForTests(realClient)
    const user = await openEditor()
    await user.click(screen.getByTestId('sun-map-compute'))
    await waitFor(() => expect(screen.getByTestId('sun-share-full-sun')).toBeInTheDocument())
    expect(screen.getByTestId('sun-share-full-sun').textContent).toBe('100%')
    expect(screen.getByTestId('sun-share-shade').textContent).toBe('0%')
    expect(screen.getByRole('button', { name: 'Recompute' })).toBeInTheDocument()
  })

  it('cancel stops a running computation', async () => {
    setSunHoursClientForTests({
      compute: (_input, options) =>
        new Promise((_resolve, reject) => {
          options?.onProgress?.(0.3)
          options?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          )
        }),
      dispose() {},
    })
    const user = await openEditor()
    await user.click(screen.getByTestId('sun-map-compute'))
    expect(await screen.findByTestId('sun-map-progress')).toBeInTheDocument()
    await user.click(screen.getByTestId('sun-map-cancel'))
    await waitFor(() => expect(screen.queryByTestId('sun-map-progress')).toBeNull())
    expect(screen.queryByTestId('sun-share-full-sun')).toBeNull()
    expect(useSunMapStore.getState().status).toBe('idle')
  })

  it('marks the map out of date after the fence moves, and is not part of the design', async () => {
    setSunHoursClientForTests(realClient)
    const user = await openEditor()
    await user.click(screen.getByTestId('sun-map-compute'))
    await screen.findByTestId('sun-share-full-sun')
    expect(screen.queryByTestId('sun-map-stale')).toBeNull()
    const past = useProjectStore.getState().past.length
    const saved = JSON.stringify((await db.projects.toArray())[0])
    act(() =>
      useProjectStore.getState().update(
        (p) =>
          addObject(p, 'fence', {
            type: 'polyline',
            points: [
              { x: 0, y: 6 },
              { x: 6, y: 6 },
            ],
            thicknessM: 0.1,
          }).project,
      ),
    )
    expect(await screen.findByTestId('sun-map-stale')).toBeInTheDocument()
    expect(useProjectStore.getState().past.length).toBe(past + 1)
    expect(saved).not.toContain('hours')
  })
})
