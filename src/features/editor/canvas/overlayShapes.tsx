import { Circle, Group, Line, Rect, Text } from 'react-konva'
import type { Snap } from '../../../geometry/snap'
import type { Point } from '../../../model/schema'

/** Screen-space helpers shared by the plot and drawing overlays. */

export const SNAP_COLOR = '#c2185b'
const LABEL_WIDTH = 120

/** A short text with a white halo, centred on `at`. */
export function HaloText({
  at,
  text,
  color = '#253325',
  size = 12,
  bold = false,
}: {
  at: Point
  text: string
  color?: string
  size?: number
  bold?: boolean
}) {
  return (
    <Text
      x={at.x}
      y={at.y}
      width={LABEL_WIDTH}
      offsetX={LABEL_WIDTH / 2}
      offsetY={size / 2}
      align="center"
      text={text}
      fontSize={size}
      fontStyle={bold ? 'bold' : 'normal'}
      fill={color}
      stroke="#ffffff"
      strokeWidth={3}
      fillAfterStrokeEnabled
      listening={false}
      perfectDrawEnabled={false}
    />
  )
}

/** Marks what the cursor snapped to: corner (square), edge (diamond), grid (cross), angle (guide). */
export function SnapIndicator({ snap, at, anchor }: { snap: Snap; at: Point; anchor?: Point }) {
  if (!snap.kind) return null
  const common = { stroke: SNAP_COLOR, strokeWidth: 1.5, listening: false } as const
  switch (snap.kind) {
    case 'vertex':
      return <Rect x={at.x - 7} y={at.y - 7} width={14} height={14} {...common} />
    case 'edge':
      return (
        <Rect
          x={at.x}
          y={at.y}
          width={10}
          height={10}
          offsetX={5}
          offsetY={5}
          rotation={45}
          {...common}
        />
      )
    case 'grid':
      return (
        <Group listening={false}>
          <Line points={[at.x - 5, at.y, at.x + 5, at.y]} {...common} />
          <Line points={[at.x, at.y - 5, at.x, at.y + 5]} {...common} />
        </Group>
      )
    case 'angle': {
      if (!anchor) return <Circle x={at.x} y={at.y} radius={4} {...common} />
      // A dashed guide along the snapped direction, extended past the cursor.
      const dx = at.x - anchor.x
      const dy = at.y - anchor.y
      const length = Math.hypot(dx, dy) || 1
      const extend = 2000 / length
      return (
        <Group listening={false}>
          <Line
            points={[anchor.x, anchor.y, anchor.x + dx * extend, anchor.y + dy * extend]}
            stroke={SNAP_COLOR}
            strokeWidth={1}
            dash={[6, 5]}
            opacity={0.6}
          />
          <Circle x={at.x} y={at.y} radius={4} {...common} />
        </Group>
      )
    }
  }
}
