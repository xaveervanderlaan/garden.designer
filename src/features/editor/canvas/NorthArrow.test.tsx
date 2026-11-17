import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { newProject } from '../../../model/defaults'
import { db } from '../../../persistence/db'
import { useProjectStore } from '../../../store/projectStore'
import { NorthArrow } from './NorthArrow'

const angle = () => useProjectStore.getState().project!.settings.northAngleDeg

beforeEach(async () => {
  const project = newProject('North', 0)
  await db.projects.add(project)
  await useProjectStore.getState().open(project.id)
})

afterEach(async () => {
  await useProjectStore.getState().close()
})

describe('north arrow', () => {
  it('rotates with the keyboard as one undo step', async () => {
    const user = userEvent.setup()
    render(<NorthArrow />)
    const slider = screen.getByRole('slider', { name: 'North direction' })
    slider.focus()
    await user.keyboard('{ArrowRight}{ArrowRight}{Shift>}{ArrowRight}{/Shift}')
    expect(angle()).toBe(17)
    expect(slider).toHaveAttribute('aria-valuenow', '17')
    act(() => useProjectStore.getState().undo())
    expect(angle()).toBe(0)
  })

  it('wraps below 0°', async () => {
    const user = userEvent.setup()
    render(<NorthArrow />)
    screen.getByRole('slider').focus()
    await user.keyboard('{ArrowLeft}')
    expect(angle()).toBe(359)
  })
})
