import type Konva from 'konva'
import { createRoot } from 'react-dom/client'
import { loadAssetImage } from '../features/editor/canvas/assetImage'
import { BACKGROUND_LAYER } from '../model/background'
import { isLayerVisible } from '../model/edit'
import { PrintStage, type RenderPlanOptions } from './PrintStage'

export type { RenderPlanOptions }

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

/**
 * Draws the plan offscreen with the editor's own drawing code and returns it as a canvas of
 * `size × pixelRatio` pixels. Konva redraws every layer at that ratio (sharp, not upscaled);
 * pixel-sized things (outlines, labels) keep their size in layout pixels.
 */
export async function renderPlan(options: RenderPlanOptions): Promise<HTMLCanvasElement> {
  const { project } = options
  const background =
    project.background && isLayerVisible(project, BACKGROUND_LAYER) ? project.background : null
  const image = background ? await loadAssetImage(background.assetId) : null
  const root = createRoot(document.createElement('div'))
  try {
    const stage = await new Promise<Konva.Stage>((resolve) => {
      root.render(
        <PrintStage {...options} background={background} image={image} onReady={resolve} />,
      )
    })
    // Let react-konva finish mounting the layers' children.
    await nextFrame()
    return stage.toCanvas({ pixelRatio: options.pixelRatio })
  } finally {
    root.unmount()
  }
}

/** The canvas encoded as an image file (PNG, or JPEG with a quality from 0 to 1). */
export function canvasBytes(
  canvas: HTMLCanvasElement,
  type: 'image/png' | 'image/jpeg',
  quality?: number,
): Promise<Uint8Array> {
  return canvasBlob(canvas, type, quality).then(
    async (blob) => new Uint8Array(await blob.arrayBuffer()),
  )
}

/** The canvas encoded as an image file. */
export function canvasBlob(
  canvas: HTMLCanvasElement,
  type: 'image/png' | 'image/jpeg',
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the image'))),
      type,
      quality,
    ),
  )
}
