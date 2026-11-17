import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../../App'

// jsdom has no real <canvas>; the plan itself is covered by the Playwright tests.
vi.mock('../canvas/GardenCanvas', () => ({ default: () => null }))
import { newProject } from '../../../model/defaults'
import { db } from '../../../persistence/db'
import { useProjectStore } from '../../../store/projectStore'
import { useUiStore } from '../../../store/uiStore'

async function openEditor() {
  const project = newProject('Sun garden', 0)
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
  vi.useRealTimers()
  await useProjectStore.getState().close()
  useUiStore.getState().reset()
})

describe('sun controls', () => {
  it('turns the sun on and off and shows the shadows layer', async () => {
    const user = await openEditor()
    act(() =>
      useProjectStore.getState().update((p) => ({
        ...p,
        layers: { ...p.layers, shadows: { ...p.layers.shadows, visible: false } },
      })),
    )
    const toggle = screen.getByTestId('sun-toggle')
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByTestId('sun-time')).toBeNull()
    await user.click(toggle)
    expect(useUiStore.getState().sun).not.toBeNull()
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('sun-time').textContent).toMatch(/^\d\d:\d\d$/)
    expect(screen.getByTestId('sun-position')).toBeInTheDocument()
    expect(useProjectStore.getState().project?.layers.shadows.visible).toBe(true)
    await user.click(toggle)
    expect(useUiStore.getState().sun).toBeNull()
  })

  it('quick picks set the 21st of the shown year', async () => {
    const user = await openEditor()
    await user.click(screen.getByTestId('sun-toggle'))
    const year = useUiStore.getState().sun!.date.year
    await user.click(screen.getByRole('button', { name: '21 Dec' }))
    expect(useUiStore.getState().sun!.date).toEqual({ year, month: 12, day: 21 })
    await user.click(screen.getByRole('button', { name: '21 Jun' }))
    expect(useUiStore.getState().sun!.date).toEqual({ year, month: 6, day: 21 })
  })

  it('plays through the day and stops at sunset', async () => {
    const user = await openEditor()
    await user.click(screen.getByTestId('sun-toggle'))
    await user.click(screen.getByRole('button', { name: '21 Dec' }))
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const before = useUiStore.getState().sun!.minutes
    act(() => screen.getByRole('button', { name: 'Play the day' }).click())
    act(() => void vi.advanceTimersByTime(100))
    expect(useUiStore.getState().sun!.minutes).toBe(before + 10)
    // Each tick is rendered before the next one is scheduled.
    for (let i = 0; i < 120; i++) act(() => void vi.advanceTimersByTime(100))
    expect(useUiStore.getState().sunPlaying).toBe(false)
    expect(screen.getByRole('button', { name: 'Play the day' })).toBeInTheDocument()
    const end = useUiStore.getState().sun!.minutes
    act(() => void vi.advanceTimersByTime(1000))
    expect(useUiStore.getState().sun!.minutes).toBe(end)
  })

  it('is not part of the design: no undo step, nothing saved', async () => {
    const user = await openEditor()
    const before = useProjectStore.getState().project
    const past = useProjectStore.getState().past.length
    await user.click(screen.getByTestId('sun-toggle'))
    await user.click(screen.getByRole('button', { name: '21 Mar' }))
    expect(useProjectStore.getState().past.length).toBe(past)
    expect(useProjectStore.getState().project?.updatedAt).toBe(before?.updatedAt)
  })
})
