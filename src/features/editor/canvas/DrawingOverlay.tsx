import { Circle, Group, Line } from 'react-konva'
import { angleDeg, distance } from '../../../geometry/polygon'
import type { Snap } from '../../../geometry/snap'
import { type Viewport, worldToScreen } from '../../../geometry/viewport'
import { formatLength, formatNumber } from '../../../i18n/units'
import { MIN_PLOT_CORNERS } from '../../../model/plot'
import type { Point } from '../../../model/schema'
import { SELECTION_COLOR } from '../../../styles/elementStyles'
import { edgeLabelPosition } from './labelPosition'
import { HaloText, SNAP_COLOR, SnapIndicator } from './overlayShapes'

type Props = {
  points: readonly Point[]
  /** The snapped cursor, or null when the mouse is not over the plan. */
  cursor: Snap | null
  viewport: Viewport
}

/** Preview of an outline being drawn: placed corners, the next edge, lengths and angle. */
export function DrawingOverlay({ points, cursor, viewport }: Props) {
  const screen = points.map((p) => worldToScreen(p, viewport))
  const last = points.at(-1)
  const lastScreen = screen.at(-1)
  const cursorScreen = cursor ? worldToScreen(cursor.point, viewport) : null
  const closes =
    !!cursor && points.length >= MIN_PLOT_CORNERS && distance(cursor.point, points[0]!) < 1e-6

  return (
    <Group listening={false}>
      {screen.length > 1 && (
        <Line points={screen.flatMap((p) => [p.x, p.y])} stroke={SELECTION_COLOR} strokeWidth={2} />
      )}
      {screen.slice(1).map((b, i) => (
        <HaloText
          key={`l${i}`}
          at={edgeLabelPosition(screen[i]!, b, true)}
          text={formatLength(distance(points[i]!, points[i + 1]!))}
        />
      ))}

      {cursorScreen && lastScreen && last && cursor && (
        <>
          <Line
            points={[lastScreen.x, lastScreen.y, cursorScreen.x, cursorScreen.y]}
            stroke={SELECTION_COLOR}
            strokeWidth={2}
            dash={[8, 5]}
          />
          {points.length >= 2 && !closes && (
            <Line
              points={[cursorScreen.x, cursorScreen.y, screen[0]!.x, screen[0]!.y]}
              stroke={SELECTION_COLOR}
              strokeWidth={1}
              dash={[3, 5]}
              opacity={0.5}
            />
          )}
          {distance(last, cursor.point) > 0 && (
            <HaloText
              at={{ x: cursorScreen.x + 70, y: cursorScreen.y - 18 }}
              text={`${formatLength(distance(last, cursor.point))} · ${formatNumber(angleDeg(last, cursor.point), cursor.kind === 'angle' ? 0 : 1)}°`}
              color={SNAP_COLOR}
              bold
            />
          )}
        </>
      )}

      {screen.map((p, i) => (
        <Circle
          key={`p${i}`}
          x={p.x}
          y={p.y}
          radius={i === 0 && closes ? 8 : 4}
          fill={i === 0 && closes ? SELECTION_COLOR : '#ffffff'}
          stroke={SELECTION_COLOR}
          strokeWidth={2}
        />
      ))}

      {cursor && cursorScreen && (
        <SnapIndicator snap={cursor} at={cursorScreen} anchor={lastScreen} />
      )}
    </Group>
  )
}
