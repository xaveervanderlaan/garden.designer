import type { PdfOptions, PngOptions } from '../../../export/planExport'
import i18n, { currentLanguage } from '../../../i18n'
import { useProjectStore } from '../../../store/projectStore'
import { useUiStore } from '../../../store/uiStore'
import { downloadBlob } from '../../projects/download'
import { currentPlantView } from '../view/plantView'

export type ExportChoice = ({ format: 'png' } & PngOptions) | ({ format: 'pdf' } & PdfOptions)

/** Renders the open design as chosen and lets the browser save the file. */
export async function runExport(choice: ExportChoice): Promise<void> {
  const project = useProjectStore.getState().project
  const { viewport, canvasSize, labelMode } = useUiStore.getState()
  if (!project || !canvasSize) throw new Error('Nothing to export')
  const { exportPng, exportPdf } = await import('../../../export/planExport')
  const ctx = {
    canvasSize,
    viewport,
    view: currentPlantView(project),
    labelMode,
    lang: currentLanguage(),
    t: i18n.t.bind(i18n),
    now: Date.now(),
  }
  const { fileName, blob } =
    choice.format === 'pdf'
      ? await exportPdf(project, choice, ctx)
      : await exportPng(project, choice, ctx)
  downloadBlob(fileName, blob)
}
