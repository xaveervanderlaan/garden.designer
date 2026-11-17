import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProject } from '../../../persistence/projects'
import { useProjectStore } from '../../../store/projectStore'
import { useUiStore } from '../../../store/uiStore'
import { ObjectMenu } from './ObjectMenu'

describe('ObjectMenu', () => {
  beforeEach(async () => {
    useUiStore.getState().reset()
    const project = await createProject('Tuin')
    await useProjectStore.getState().open(project.id)
  })

  afterEach(async () => {
    await useProjectStore.getState().close()
    useUiStore.getState().reset()
  })

  it('opens the surfaces menu and starts drawing a lawn', async () => {
    const user = userEvent.setup()
    render(<ObjectMenu group="surfaces" />)
    await user.click(screen.getByRole('button', { name: 'Add a surface' }))
    expect(screen.getByRole('menu', { name: 'Surfaces' })).toBeInTheDocument()
    await user.click(screen.getByRole('menuitem', { name: /^Lawn/ }))
    const drawing = useUiStore.getState().drawing
    expect(drawing?.target).toMatchObject({ kind: 'object', objectKind: 'lawn' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('lists furniture variants with their sizes', async () => {
    const user = userEvent.setup()
    render(<ObjectMenu group="extras" />)
    act(() => useUiStore.getState().setObjectMenuOpen('extras'))
    expect(
      await screen.findByRole('menuitem', { name: /^Bench\s*1\.5\s*×\s*0\.6\s*m/ }),
    ).toBeVisible()
    expect(screen.getByRole('menuitem', { name: /^Parasol\s*Ø\s*3\s*m/ })).toBeVisible()
    await user.click(screen.getByRole('menuitem', { name: /^Bench/ }))
    expect(useUiStore.getState().drawing?.target).toMatchObject({
      objectKind: 'furniture',
      variant: 'bench',
    })
  })
})
