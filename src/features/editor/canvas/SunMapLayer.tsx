import { useMemo } from 'react'
import { Image, Layer } from 'react-konva'
import { classifyGrid } from '../../../geometry/sunHours'
import type { Viewport } from '../../../geometry/viewport'
import type { Project } from '../../../model/schema'
import { useSunMapStore } from '../../../store/sunMapStore'
import { SUN_MAP_STYLE } from '../../../styles/elementStyles'
import { sunMapPixels } from '../sunmap/sunMap'

/** The sun-hours classes as a heatmap (one pixel per cell, scaled up) under the shadows. */
export function SunMapLayer({ project, viewport }: { project: Project; viewport: Viewport }) {
  const result = useSunMapStore((s) => s.result)
  const visible = useSunMapStore((s) => s.visible)
  const thresholds = project.settings.sunThresholds
  const canvas = useMemo(() => {
    if (!result) return null
    const { cols, rows } = result.grid
    const el = document.createElement('canvas')
    el.width = cols
    el.height = rows
    const ctx = el.getContext('2d')
    if (!ctx) return null
    const pixels = sunMapPixels(classifyGrid(result, thresholds))
    ctx.putImageData(new ImageData(pixels as Uint8ClampedArray<ArrayBuffer>, cols, rows), 0, 0)
    return el
  }, [result, thresholds])
  if (!visible || !result || !canvas) return null
  const { originX, originY, cellM } = result.grid
  return (
    <Layer listening={false} imageSmoothingEnabled={false}>
      <Image
        image={canvas}
        x={viewport.x + originX * viewport.scale}
        y={viewport.y + originY * viewport.scale}
        scaleX={cellM * viewport.scale}
        scaleY={cellM * viewport.scale}
        opacity={SUN_MAP_STYLE.opacity}
      />
    </Layer>
  )
}
