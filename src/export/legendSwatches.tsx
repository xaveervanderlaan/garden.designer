import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'

const SCALE = 4

/**
 * Draws a small SVG element (a legend swatch) to PNG bytes, or null when it can't be rendered
 * (no SVG support, a failed image load).
 */
export async function swatchPng(
  svg: ReactElement | null,
  widthPx: number,
  heightPx: number,
): Promise<Uint8Array | null> {
  if (!svg) return null
  try {
    const markup = renderToStaticMarkup(svg).replace(
      /^<svg/,
      '<svg xmlns="http://www.w3.org/2000/svg"',
    )
    const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }))
    try {
      const image = new Image()
      image.src = url
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = widthPx * SCALE
      canvas.height = heightPx * SCALE
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      return blob ? new Uint8Array(await blob.arrayBuffer()) : null
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch {
    return null
  }
}
