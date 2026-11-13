import { Circle, Group, Line } from 'react-konva'
import { imageToWorld } from '../../../geometry/calibration'
import { type Viewport, worldToScreen } from '../../../geometry/viewport'
import { formatLength } from '../../../i18n/units'
import type { Background, Point } from '../../../model/schema'
import { CALIBRATION_COLOR } from '../../../styles/elementStyles'
import { edgeLabelPosition } from './labelPosition'
import { HaloText } from './overlayShapes'

/** An end of the measured line: a ring with a cross, so the exact spot stays visible. */
function EndPoint({ at }: { at: Point }) {
  const common = { stroke: CALIBRATION_COLOR, strokeWidth: 1.5, listening: false } as const
  return (
    <Group listening={false}>
      <Circle x={at.x} y={at.y} radius={7} {...common} />
      <Line points={[at.x - 11, at.y, at.x + 11, at.y]} {...common} strokeWidth={1} />
      <Line points={[at.x, at.y - 11, at.x, at.y + 11]} {...common} strokeWidth={1} />
    </Group>
  )
}

function MeasuredLine({ a, b, label }: { a: Point; b: Point; label?: string }) {
  return (
    <Group listening={false}>
      <Line
        points={[a.x, a.y, b.x, b.y]}
        stroke={CALIBRATION_COLOR}
        strokeWidth={2}
        dash={[8, 4]}
        listening={false}
      />
      <EndPoint at={a} />
      <EndPoint at={b} />
      {label && (
        <HaloText at={edgeLabelPosition(a, b, true)} text={label} color={CALIBRATION_COLOR} bold />
      )}
    </Group>
  )
}

/** The line being measured with the calibrate tool (world points; the cursor ends an open line). */
export function CalibrationDraft({
  points,
  cursor,
  viewport,
}: {
  points: readonly Point[]
  cursor: Point | null
  viewport: Viewport
}) {
  const [first, second] = points
  if (!first) return null
  const a = worldToScreen(first, viewport)
  const end = second ?? cursor
  if (!end) return <EndPoint at={a} />
  return <MeasuredLine a={a} b={worldToScreen(end, viewport)} />
}

/** The line the site plan was last calibrated with, and its real length. */
export function CalibrationLine({
  background,
  viewport,
}: {
  background: Background
  viewport: Viewport
}) {
  const calibration = background.calibration
  if (!calibration) return null
  const at = (pixel: Point) => worldToScreen(imageToWorld(background, pixel), viewport)
  return (
    <MeasuredLine
      a={at(calibration.a)}
      b={at(calibration.b)}
      label={formatLength(calibration.distanceM)}
    />
  )
}
