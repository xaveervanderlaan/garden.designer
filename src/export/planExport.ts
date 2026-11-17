import type { TFunction } from 'i18next'
import { type Size, type Viewport, fitBounds } from '../geometry/viewport'
import type { Language } from '../i18n'
import type { Project } from '../model/schema'
import type { LabelMode } from '../store/uiStore'
import type { PlantView } from '../styles/plantAppearance'
import { formatDate } from '../i18n/format'
import { formatRoundLength } from '../i18n/units'
import { monthLong } from '../i18n/months'
import {
  type PngFactor,
  designBounds,
  pdfFileName,
  pngFileName,
  printViewport,
} from './exportOptions'
import { northArrowShape, pdfText, titleBlockLayout } from './pdfLayout'
import { canvasBlob, canvasBytes, renderPlan } from './renderPlan'
import {
  type Orientation,
  type PaperSize,
  type PrintScale,
  pageLayout,
  printedWorldBounds,
  scaleBar,
} from './scale'

/** What an export needs to know about the editor: the plan area, the view bar, labels, language. */
export type ExportContext = {
  /** The plan area's size on screen (CSS pixels). */
  canvasSize: Size
  /** The editor's current viewport (for "current view"). */
  viewport: Viewport
  view: PlantView
  labelMode: LabelMode
  lang: Language
  t: TFunction
  now: number
}

export type PngOptions = { area: 'view' | 'plan'; factor: PngFactor }

/**
 * The plan as a PNG, `factor` times the plan area's size on screen: either what the editor shows
 * now, or the whole plan fitted like zoom to fit.
 */
export async function exportPng(
  project: Project,
  { area, factor }: PngOptions,
  ctx: ExportContext,
): Promise<{ fileName: string; blob: Blob }> {
  const viewport = area === 'view' ? ctx.viewport : fitBounds(designBounds(project), ctx.canvasSize)
  const canvas = await renderPlan({
    project,
    viewport,
    size: ctx.canvasSize,
    pixelRatio: factor,
    view: ctx.view,
    labelMode: ctx.labelMode,
    lang: ctx.lang,
  })
  return { fileName: pngFileName(project.name), blob: await canvasBlob(canvas, 'image/png') }
}

export type PdfOptions = { paper: PaperSize; orientation: Orientation; scale: PrintScale }

/** "Year 2030 · March", "Fully grown": the view bar's year and month. */
function viewLine(view: PlantView, t: TFunction): string {
  const year =
    view.year === 'mature'
      ? t('editor.export.pdfDoc.matureView')
      : t('editor.export.pdfDoc.yearView', { year: view.year })
  return view.month ? `${year} · ${monthLong(view.month)}` : year
}

/**
 * The design as a PDF: page 1 is the plan at exactly 1:scale (300 dpi image, frame, title block
 * with scale bar and north arrow); page 2 onwards hold the legend and planting list.
 */
export async function exportPdf(
  project: Project,
  { paper, orientation, scale }: PdfOptions,
  ctx: ExportContext,
): Promise<{ fileName: string; blob: Blob }> {
  const layout = pageLayout(paper, orientation)
  const world = printedWorldBounds(designBounds(project), layout.plan, scale)
  const { viewport, size, pixelRatio } = printViewport(world, layout.plan, scale)
  const canvas = await renderPlan({
    project,
    viewport,
    size,
    pixelRatio,
    view: ctx.view,
    labelMode: ctx.labelMode,
    lang: ctx.lang,
  })
  const jpeg = await canvasBytes(canvas, 'image/jpeg', 0.92)
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: paper.toLowerCase(), orientation, compress: true })
  doc.setProperties({ title: pdfText(project.name) })
  const { plan, titleBlock } = layout
  doc.addImage(jpeg, 'JPEG', plan.xMm, plan.yMm, plan.widthMm, plan.heightMm)

  // Frame around the plan and the title block.
  doc.setDrawColor(0).setLineWidth(0.3)
  doc.rect(plan.xMm, plan.yMm, plan.widthMm, plan.heightMm)
  doc.rect(titleBlock.xMm, titleBlock.yMm, titleBlock.widthMm, titleBlock.heightMm)

  const parts = titleBlockLayout(titleBlock)
  doc.setTextColor(0)
  doc.setFont('helvetica', 'bold').setFontSize(13)
  doc.text(pdfText(project.name), parts.name.x, parts.name.y)
  doc.setFont('helvetica', 'normal').setFontSize(8)
  const [first, second] = parts.lines
  doc.text(
    pdfText(
      ctx.t('editor.export.pdfDoc.scaleLine', {
        scale,
        paper,
        date: formatDate(ctx.now),
      }),
    ),
    first!.x,
    first!.y,
  )
  doc.text(
    pdfText(`${viewLine(ctx.view, ctx.t)} · ${ctx.t('editor.export.pdfDoc.legendOnPage2')}`),
    second!.x,
    second!.y,
  )

  // Scale bar: 0 and its length, two alternating segments.
  const bar = scaleBar(parts.scaleBar.maxWidthMm, scale)
  if (bar.lengthM > 0) {
    const { xMm, yMm } = parts.scaleBar
    doc.setLineWidth(0.4)
    doc.line(xMm, yMm, xMm + bar.widthMm, yMm)
    for (const x of [xMm, xMm + bar.widthMm / 2, xMm + bar.widthMm]) doc.line(x, yMm - 1.5, x, yMm)
    doc.setFontSize(7)
    doc.text('0', xMm, yMm + 3.5, { align: 'center' })
    doc.text(pdfText(formatRoundLength(bar.lengthM, ctx.lang)), xMm + bar.widthMm, yMm + 3.5, {
      align: 'center',
    })
  }

  // North arrow.
  const { cx, cy, rMm } = parts.north
  const arrow = northArrowShape(cx, cy, rMm * 0.75, project.settings.northAngleDeg)
  doc.setLineWidth(0.3)
  doc.setFillColor(0, 0, 0)
  doc.triangle(
    arrow.tip.x,
    arrow.tip.y,
    arrow.left.x,
    arrow.left.y,
    arrow.right.x,
    arrow.right.y,
    'F',
  )
  doc.setFontSize(7).setFont('helvetica', 'bold')
  doc.text('N', arrow.label.x, arrow.label.y + 1, { align: 'center' })

  // Page 2 onwards: legend and planting list.
  doc.addPage(paper.toLowerCase(), 'portrait')
  const { drawListPages } = await import('./pdfLists')
  await drawListPages(doc, project, ctx)

  return { fileName: pdfFileName(project.name, paper, scale), blob: doc.output('blob') }
}
