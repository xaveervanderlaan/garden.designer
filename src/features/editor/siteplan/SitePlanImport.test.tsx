import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../../persistence/db'
import { createProject } from '../../../persistence/projects'
import { useProjectStore } from '../../../store/projectStore'
import { useUiStore } from '../../../store/uiStore'
import { SitePlanImport } from './SitePlanImport'

vi.mock('./sitePlanFile', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./sitePlanFile')>()),
  // jsdom can't decode images
  readImage: vi.fn(async (_file: File, mimeType: string) => ({
    data: new Uint8Array([1, 2, 3]).buffer,
    mimeType,
    widthPx: 100,
    heightPx: 50,
  })),
}))

describe('SitePlanImport', () => {
  afterEach(async () => {
    vi.restoreAllMocks()
    await useProjectStore.getState().close()
  })

  it('explains a full storage and can be closed', async () => {
    const project = await createProject('Tuin')
    await useProjectStore.getState().open(project.id)
    const assetsBefore = await db.assets.count()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(db.assets, 'add').mockRejectedValueOnce(new DOMException('full', 'QuotaExceededError'))
    const user = userEvent.setup()
    render(<SitePlanImport />)

    const file = new File([new Uint8Array([1, 2, 3])], 'plan.png', { type: 'image/png' })
    fireEvent.change(screen.getByTestId('site-plan-input'), { target: { files: [file] } })

    expect(await screen.findByRole('alert')).toHaveTextContent(/storage is full/)
    expect(useUiStore.getState().sitePlanDialogOpen).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Close' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(useUiStore.getState().sitePlanDialogOpen).toBe(false))
    expect(useProjectStore.getState().project?.background).toBeUndefined()
    expect(await db.assets.count()).toBe(assetsBefore)
  })
})
