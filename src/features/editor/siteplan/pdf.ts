import { GlobalWorkerOptions, type PDFDocumentProxy, getDocument } from 'pdfjs-dist'
// The worker is bundled with the app (no CDN); Vite gives us its URL.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { SitePlanError, type SitePlanImage, pdfRenderScale } from './sitePlanFile'

/**
 * PDF site plans, rendered locally with pdf.js. This module is loaded only when a PDF is imported:
 * pdf.js is large. Its fonts and image decoders are served by our own site (see
 * scripts/vite-plugin-pdfjs-assets.ts).
 */

GlobalWorkerOptions.workerSrc = workerUrl

const assetsUrl = (folder: string) =>
  new URL(`${import.meta.env.BASE_URL}pdfjs/${folder}/`, window.location.href).href

export type PdfDocument = {
  pageCount: number
  /** A small preview of a page, as a PNG data URL, at most `maxSidePx` on its longest side. */
  thumbnail: (page: number, maxSidePx: number) => Promise<string>
  /** Renders a page at high resolution (see pdfRenderScale) to a PNG. */
  render: (page: number) => Promise<SitePlanImage>
  destroy: () => void
}

export async function openPdf(data: ArrayBuffer): Promise<PdfDocument> {
  const task = getDocument({
    // pdf.js takes ownership of the buffer it gets: give it a copy.
    data: new Uint8Array(data.slice(0)),
    wasmUrl: assetsUrl('wasm'),
    standardFontDataUrl: assetsUrl('standard_fonts'),
    iccUrl: assetsUrl('iccs'),
  })
  let doc: PDFDocumentProxy
  try {
    doc = await task.promise
  } catch (error) {
    void task.destroy()
    const name = error instanceof Error ? error.name : ''
    throw new SitePlanError(
      name === 'PasswordException' ? 'pdfPassword' : 'unreadable',
      String(error),
    )
  }
  if (doc.numPages < 1) {
    void task.destroy()
    throw new SitePlanError('pdfEmpty', 'The PDF has no pages')
  }

  async function renderToCanvas(pageNumber: number, scaleFor: (w: number, h: number) => number) {
    const page = await doc.getPage(pageNumber)
    try {
      const size = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: scaleFor(size.width, size.height) })
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.floor(viewport.width))
      canvas.height = Math.max(1, Math.floor(viewport.height))
      await page.render({ canvas, viewport, background: '#ffffff' }).promise
      return canvas
    } finally {
      page.cleanup()
    }
  }

  return {
    pageCount: doc.numPages,

    async thumbnail(pageNumber, maxSidePx) {
      const canvas = await renderToCanvas(pageNumber, (w, h) => maxSidePx / Math.max(w, h))
      const url = canvas.toDataURL('image/png')
      canvas.width = 0 // free the memory now
      return url
    },

    async render(pageNumber) {
      let canvas: HTMLCanvasElement
      try {
        canvas = await renderToCanvas(pageNumber, pdfRenderScale)
      } catch (error) {
        throw new SitePlanError('unreadable', String(error))
      }
      const { width, height } = canvas
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      canvas.width = 0
      if (!blob) throw new SitePlanError('tooLarge', 'Could not encode the rendered page')
      return {
        data: await blob.arrayBuffer(),
        mimeType: 'image/png',
        widthPx: width,
        heightPx: height,
      }
    },

    destroy() {
      void task.destroy()
    },
  }
}
