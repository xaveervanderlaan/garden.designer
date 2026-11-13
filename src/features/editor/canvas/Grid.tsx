import { Shape } from 'react-konva'
import { gridLinePositions, gridSteps } from '../../../geometry/grid'
import { type Size, type Viewport, visibleBounds } from '../../../geometry/viewport'
import { GRID_COLORS } from '../../../styles/elementStyles'

/** Background grid in screen space (crisp 1 px lines); density follows the zoom level. */
export function Grid({ viewport, size }: { viewport: Viewport; size: Size }) {
  return (
    <Shape
      listening={false}
      perfectDrawEnabled={false}
      sceneFunc={(ctx) => {
        const { minor, major } = gridSteps(viewport.scale)
        const visible = visibleBounds(viewport, size)
        const drawLines = (step: number, color: string) => {
          ctx.beginPath()
          for (const x of gridLinePositions(visible.minX, visible.maxX, step)) {
            const sx = Math.round(x * viewport.scale + viewport.x) + 0.5
            ctx.moveTo(sx, 0)
            ctx.lineTo(sx, size.height)
          }
          for (const y of gridLinePositions(visible.minY, visible.maxY, step)) {
            const sy = Math.round(y * viewport.scale + viewport.y) + 0.5
            ctx.moveTo(0, sy)
            ctx.lineTo(size.width, sy)
          }
          ctx.setAttr('strokeStyle', color)
          ctx.setAttr('lineWidth', 1)
          ctx.stroke()
        }
        drawLines(minor, GRID_COLORS.minor)
        drawLines(major, GRID_COLORS.major)
      }}
    />
  )
}
