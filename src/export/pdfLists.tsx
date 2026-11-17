import type { jsPDF } from 'jspdf'
import { legendEntries } from '../model/legend'
import { plantName } from '../model/plants'
import { plantingList } from '../model/plantingList'
import type { Project } from '../model/schema'
import { LegendSwatch } from '../features/editor/panels/legendItems'
import { legendName } from '../features/editor/panels/legendText'
import type { ExportContext } from './planExport'
import { swatchPng } from './legendSwatches'
import { LEGEND_ROW_MM, LIST_MARGIN_MM, listLayout, pdfText } from './pdfLayout'

/**
 * Page 2 onwards (portrait): the legend with its swatches, then the planting list for the whole
 * design, continuing on more pages when long. Page numbers go on every page.
 */
export async function drawListPages(doc: jsPDF, project: Project, ctx: ExportContext) {
  const { t, lang } = ctx
  const page = doc.internal.pageSize
  const pageMm = { widthMm: page.getWidth(), heightMm: page.getHeight() }
  const entries = legendEntries(project)
  const rows = plantingList(project)
  const layout = listLayout(entries.length, rows.length, pageMm)
  const left = LIST_MARGIN_MM
  const right = pageMm.widthMm - LIST_MARGIN_MM
  const pdfPage = (index: number) => doc.setPage(index + 2)

  // Pages the layout needs (page 1 exists, page 2 is added by the caller).
  for (let i = 1; i < layout.pageCount; i++) doc.addPage()
  doc.setTextColor(0)

  if (entries.length > 0) {
    pdfPage(0)
    doc.setFont('helvetica', 'bold').setFontSize(13)
    doc.text(pdfText(t('editor.export.pdfDoc.legend')), left, layout.legend.yMm + 5)
    doc.setFont('helvetica', 'normal').setFontSize(9)
    for (const [i, entry] of entries.entries()) {
      const col = i % layout.legend.columns
      const row = Math.floor(i / layout.legend.columns)
      const x = left + col * layout.legend.columnMm
      const y = layout.legend.firstRowYMm + row * LEGEND_ROW_MM
      const png = await swatchPng(<LegendSwatch project={project} entry={entry} />, 28, 20)
      if (png) doc.addImage(png, 'PNG', x, y, 10, 7.1)
      doc.text(pdfText(legendName(t, entry)), x + 12, y + 4.6, {
        maxWidth: layout.legend.columnMm - 14,
      })
    }
  }

  // Planting list.
  const cols = { code: left, name: left + 12, latin: left + 80, count: right }
  pdfPage(layout.table.page)
  doc.setFont('helvetica', 'bold').setFontSize(13)
  doc.text(pdfText(t('editor.export.pdfDoc.plantingList')), left, layout.table.yMm + 5)
  doc.setFontSize(9)
  const headY = layout.table.yMm + 8 + 4
  doc.text(pdfText(t('editor.export.pdfDoc.code')), cols.code, headY)
  doc.text(pdfText(t('editor.export.pdfDoc.name')), cols.name, headY)
  doc.text(pdfText(t('editor.export.pdfDoc.latin')), cols.latin, headY)
  doc.text(pdfText(t('editor.export.pdfDoc.count')), cols.count, headY, { align: 'right' })
  doc.setLineWidth(0.3).line(left, headY + 1.5, right, headY + 1.5)
  doc.setFont('helvetica', 'normal')
  for (const [i, row] of rows.entries()) {
    const at = layout.rows[i]!
    pdfPage(at.page)
    const y = at.yMm + 4
    doc.text(String(row.code), cols.code, y)
    doc.text(pdfText(row.plant ? plantName(row.plant, lang) : '?'), cols.name, y, {
      maxWidth: cols.latin - cols.name - 2,
    })
    doc.text(pdfText(row.plant?.names.latin ?? ''), cols.latin, y, {
      maxWidth: cols.count - cols.latin - 14,
    })
    doc.text(String(row.count), cols.count, y, { align: 'right' })
  }
  pdfPage(layout.total.page)
  const totalY = layout.total.yMm + 5
  doc.setLineWidth(0.3).line(left, layout.total.yMm + 1, right, layout.total.yMm + 1)
  doc.setFont('helvetica', 'bold')
  doc.text(pdfText(t('editor.export.pdfDoc.total')), cols.name, totalY)
  doc.text(String(rows.reduce((sum, r) => sum + r.count, 0)), cols.count, totalY, {
    align: 'right',
  })

  // Page numbers on every page.
  const pages = doc.getNumberOfPages()
  doc.setFont('helvetica', 'normal').setFontSize(8)
  for (let n = 1; n <= pages; n++) {
    doc.setPage(n)
    const size = doc.internal.pageSize
    doc.text(
      pdfText(t('editor.export.pdfDoc.page', { page: n, pages })),
      size.getWidth() / 2,
      size.getHeight() - 4,
      { align: 'center' },
    )
  }
}
