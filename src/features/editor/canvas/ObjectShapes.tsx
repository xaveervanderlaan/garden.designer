import type Konva from 'konva'
import { Circle, Line, Shape } from 'react-konva'
import { POINT_OBJECT_RADIUS_M, boundsOfPoints } from '../../../geometry/bounds'
import type { GardenObject, Point } from '../../../model/schema'
import {
  DEFAULT_STROKE_PX,
  EXISTING_STYLE,
  OBJECT_STYLES,
  SELECTION_COLOR,
} from '../../../styles/elementStyles'
import { drawOutlineObject, tracePolygon } from './objectDrawing'

/**
 * How a garden object is drawn on the plan, in its group's coordinates. Objects edited with the
 * move/rotate/resize handles sit in a group turned to their own frame (see Items), so the points
 * passed here are already turned back by that angle.
 */

const flat = (points: readonly Point[]) => points.flatMap((p) => [p.x, p.y])
/** Stroke widths in screen pixels, independent of zoom. */
const fixedStroke = { strokeScaleEnabled: false, perfectDrawEnabled: false } as const

/** Zoom (pixels per metre) of a shape inside the world group. */
const pxPerM = (shape: Konva.Node) => shape.getAbsoluteScale().x

type Props = {
  object: GardenObject
  /** The shape's points (polygon, polyline) or position (point) in the group's coordinates. */
  points: readonly Point[]
  selected: boolean
}

export function ObjectShape({ object, points, selected }: Props) {
  switch (object.shape.type) {
    case 'polygon':
      return <OutlineShape object={object} points={points} selected={selected} />
    case 'polyline':
      return (
        <LineShape
          object={object}
          points={points}
          thicknessM={object.shape.thicknessM}
          selected={selected}
        />
      )
    case 'point':
      return <SymbolShape object={object} at={points[0]!} selected={selected} />
  }
}

/** A bed, building or surface: fill, pattern and outline, muted when it is already there. */
function OutlineShape({ object, points, selected }: Props) {
  const style = OBJECT_STYLES[object.kind]
  const existing = object.status === 'existing'
  const bounds = boundsOfPoints(points)
  return (
    <Shape
      // A custom shape has no size of its own; the Transformer measures this box.
      ref={(node) => {
        if (node && bounds) {
          node.getSelfRect = () => ({
            x: bounds.minX,
            y: bounds.minY,
            width: bounds.maxX - bounds.minX,
            height: bounds.maxY - bounds.minY,
          })
        }
      }}
      sceneFunc={(context, shape) =>
        drawOutlineObject(context._context, points, style, { selected, existing }, pxPerM(shape))
      }
      hitFunc={(context, shape) => {
        tracePolygon(context, points)
        context.fillStrokeShape(shape)
      }}
      perfectDrawEnabled={false}
    />
  )
}

function LineShape({
  object,
  points,
  thicknessM,
  selected,
}: Omit<Props, 'points'> & { points: readonly Point[]; thicknessM: number }) {
  const style = OBJECT_STYLES[object.kind]
  const opacity = object.status === 'existing' ? EXISTING_STYLE.fillOpacity : 1
  return (
    <>
      {/* Wide invisible line so thin fences and walls are easy to click. */}
      <Line points={flat(points)} stroke="transparent" strokeWidth={14} {...fixedStroke} />
      <Line
        points={flat(points)}
        stroke={selected ? SELECTION_COLOR : style.fill}
        strokeWidth={thicknessM}
        lineCap="round"
        lineJoin="round"
        opacity={selected ? 1 : opacity}
        perfectDrawEnabled={false}
      />
    </>
  )
}

function SymbolShape({ object, at, selected }: Omit<Props, 'points'> & { at: Point }) {
  const style = OBJECT_STYLES[object.kind]
  const existing = object.status === 'existing'
  return (
    <Circle
      x={at.x}
      y={at.y}
      radius={POINT_OBJECT_RADIUS_M}
      fill={style.fill}
      stroke={selected ? SELECTION_COLOR : style.stroke}
      strokeWidth={selected ? 2.5 : (style.strokeWidthPx ?? DEFAULT_STROKE_PX)}
      opacity={existing && !selected ? EXISTING_STYLE.fillOpacity : 1}
      {...fixedStroke}
    />
  )
}
