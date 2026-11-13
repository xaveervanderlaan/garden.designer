/**
 * Reading a site plan: PNG/JPG/WebP images are stored as they are; a PDF page is rendered to a PNG
 * (see pdf.ts). Everything happens in the browser.
 */

export type SitePlanErrorCode =
  'unsupported' | 'tooLarge' | 'unreadable' | 'pdfPassword' | 'pdfEmpty' | 'saveFailed'

export class SitePlanError extends Error {
  readonly code: SitePlanErrorCode

  constructor(code: SitePlanErrorCode, message: string) {
    super(message)
    this.name = 'SitePlanError'
    this.code = code
  }
}

/** An image ready to be stored: its bytes, type and size. */
export type SitePlanImage = {
  data: ArrayBuffer
  mimeType: string
  widthPx: number
  heightPx: number
}

const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}
const PDF_TYPE = 'application/pdf'

/** For the file picker. */
export const SITE_PLAN_ACCEPT = [
  PDF_TYPE,
  ...new Set(Object.values(IMAGE_TYPES)),
  ...Object.keys(IMAGE_TYPES).map((ext) => `.${ext}`),
  '.pdf',
].join(',')

/** Larger files are refused before reading them. */
export const MAX_FILE_BYTES = 100 * 1024 * 1024

export type SitePlanKind = { type: 'pdf' } | { type: 'image'; mimeType: string }

/** What kind of site plan a file is, by its type or (if the browser gives none) its extension. */
export function sitePlanKind(file: Pick<File, 'name' | 'type'>): SitePlanKind | null {
  const extension = file.name.toLowerCase().split('.').pop() ?? ''
  if (file.type === PDF_TYPE || (!file.type && extension === 'pdf')) return { type: 'pdf' }
  const knownTypes = Object.values(IMAGE_TYPES)
  if (knownTypes.includes(file.type)) return { type: 'image', mimeType: file.type }
  const byExtension = IMAGE_TYPES[extension]
  if (!file.type && byExtension) return { type: 'image', mimeType: byExtension }
  return null
}

// --- PDF render size ----------------------------------------------------------------------------

/** A PDF page is rendered at this resolution… */
export const PDF_TARGET_DPI = 300
/** …but no larger than this on either side… */
export const MAX_RENDER_SIDE_PX = 8192
/** …or in total (16 megapixels keeps memory use and the stored PNG reasonable). */
export const MAX_RENDER_AREA_PX = 16_000_000
const POINTS_PER_INCH = 72

/** The pdf.js scale (pixels per PDF point) to render a page of this size (in points) at. */
export function pdfRenderScale(widthPt: number, heightPt: number): number {
  return Math.min(
    PDF_TARGET_DPI / POINTS_PER_INCH,
    MAX_RENDER_SIDE_PX / Math.max(widthPt, heightPt),
    Math.sqrt(MAX_RENDER_AREA_PX / (widthPt * heightPt)),
  )
}

// --- Images -------------------------------------------------------------------------------------

/** Reads an image file and checks that the browser can decode it. */
export async function readImage(file: File, mimeType: string): Promise<SitePlanImage> {
  const data = await file.arrayBuffer()
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(new Blob([data], { type: mimeType }))
  } catch (error) {
    throw new SitePlanError('unreadable', String(error))
  }
  const { width, height } = bitmap
  bitmap.close()
  if (width === 0 || height === 0) throw new SitePlanError('unreadable', 'Empty image')
  return { data, mimeType, widthPx: width, heightPx: height }
}
