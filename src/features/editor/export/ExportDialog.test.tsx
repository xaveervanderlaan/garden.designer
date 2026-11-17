import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { exportPdf, exportPng } from '../../../export/planExport'
import { createProject } from '../../../persistence/projects'
import { useProjectStore } from '../../../store/projectStore'
import { useUiStore } from '../../../store/uiStore'
import { downloadBlob } from '../../projects/download'
import { ExportDialog } from './ExportDialog'

vi.mock('../../../export/planExport', () => ({ exportPng: vi.fn(), exportPdf: vi.fn() }))
vi.mock('../../projects/download', () => ({ downloadBlob: vi.fn() }))

async function openDialog(canvas = { width: 1500, height: 1000 }) {
  const project = await createProject('Voortuin')
  await act(async () => {
    await useProjectStore.getState().open(project.id)
    useUiStore.getState().setCanvasSize(canvas)
    useUiStore.getState().setExportOpen(true)
  })
  render(<ExportDialog />)
  return screen.getByRole('dialog', { name: 'Export' })
}

describe('ExportDialog', () => {
  beforeEach(() => {
    vi.mocked(exportPng).mockReset()
    vi.mocked(exportPdf).mockReset()
    vi.mocked(downloadBlob).mockReset()
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    useUiStore.getState().reset()
    await useProjectStore.getState().close()
  })

  it('suggests orientation and scale and warns when the plan doesn\u2019t fit', async () => {
    const user = userEvent.setup()
    await openDialog()
    expect(screen.getByRole('radio', { name: 'PDF for printing' })).toBeChecked()
    expect(screen.getByRole('combobox', { name: 'Orientation' })).toHaveValue('landscape')
    expect(screen.getByRole('combobox', { name: 'Scale' })).toHaveValue('200')
    expect(screen.getByRole('option', { name: '1:200 (suggested)' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Scale' }), '50')
    expect(screen.getByRole('alert')).toHaveTextContent('so the edges are cut off')
  })

  it('exports a PDF with the chosen options and closes', async () => {
    const user = userEvent.setup()
    const blob = new Blob(['pdf'], { type: 'application/pdf' })
    vi.mocked(exportPdf).mockResolvedValue({ fileName: 'voortuin-a3-1-100.pdf', blob })
    await openDialog()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Paper' }), 'A3')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Scale' }), '100')
    await user.click(screen.getByRole('button', { name: 'Export' }))

    expect(exportPdf).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Voortuin' }),
      expect.objectContaining({ format: 'pdf', paper: 'A3', orientation: 'landscape', scale: 100 }),
      expect.objectContaining({ lang: 'en' }),
    )
    expect(downloadBlob).toHaveBeenCalledWith('voortuin-a3-1-100.pdf', blob)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('lists PNG sizes in pixels and disables those over the cap', async () => {
    const user = userEvent.setup()
    await openDialog()
    await user.click(screen.getByRole('radio', { name: 'PNG image' }))
    const options = screen.getAllByRole<HTMLOptionElement>('option')
    expect(options.map((o) => o.textContent)).toEqual([
      '1× (1500 × 1000 px)',
      '2× (3000 × 2000 px)',
      '3× (4500 × 3000 px)',
      '4× (6000 × 4000 px)',
    ])
    expect(options.map((o) => o.disabled)).toEqual([false, false, false, true])
    expect(screen.getByRole('combobox', { name: 'Size' })).toHaveValue('2')
    expect(screen.getByRole('radio', { name: 'Whole plan' })).toBeChecked()
  })

  it('exports a PNG with the chosen options and closes', async () => {
    const user = userEvent.setup()
    const blob = new Blob(['png'], { type: 'image/png' })
    vi.mocked(exportPng).mockResolvedValue({ fileName: 'voortuin-plan.png', blob })
    await openDialog()
    await user.click(screen.getByRole('radio', { name: 'PNG image' }))
    await user.click(screen.getByRole('radio', { name: 'Current view' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Size' }), '3')
    await user.click(screen.getByRole('button', { name: 'Export' }))

    expect(exportPng).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Voortuin' }),
      expect.objectContaining({ area: 'view', factor: 3 }),
      expect.objectContaining({ canvasSize: { width: 1500, height: 1000 }, lang: 'en' }),
    )
    expect(downloadBlob).toHaveBeenCalledWith('voortuin-plan.png', blob)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows an error when the export fails', async () => {
    const user = userEvent.setup()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(exportPdf).mockRejectedValue(new Error('canvas too big'))
    await openDialog()
    await user.click(screen.getByRole('button', { name: 'Export' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('The export failed')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export' })).toBeEnabled()
    expect(downloadBlob).not.toHaveBeenCalled()
  })
})
