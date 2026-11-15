import { Shape } from 'react-konva'
import type { Point } from '../../../model/schema'
import { PLANTING_MARKS } from '../../../styles/elementStyles'
import type { PlantAppearance } from '../../../styles/plantAppearance'
import { drawPlantSymbol, drawnRadius } from './plantDrawing'

/**
 * See-through plants where they would be placed: filling a bed, planting a row, stamping or
 * dropping from the library. Drawn in world space by one shape.
 */
export function PlantPreview({
  appearance,
  positions,
}: {
  appearance: PlantAppearance
  positions: readonly Point[]
}) {
  if (positions.length === 0) return null
  return (
    <Shape
      listening={false}
      perfectDrawEnabled={false}
      opacity={PLANTING_MARKS.previewOpacity}
      sceneFunc={(context, shape) => {
        const ctx = context._context
        const scale = shape.getAbsoluteScale().x
        for (const at of positions) {
          drawPlantSymbol(ctx, appearance, at, appearance.radiusM, scale)
          ctx.beginPath()
          ctx.arc(at.x, at.y, drawnRadius(appearance.radiusM, scale), 0, 2 * Math.PI)
          ctx.setLineDash([4 / scale, 3 / scale])
          ctx.lineWidth = 1.25 / scale
          ctx.strokeStyle = PLANTING_MARKS.selectionColor
          ctx.stroke()
          ctx.setLineDash([])
        }
      }}
    />
  )
}
