import type Konva from 'konva'
import { Line, Shape } from 'react-konva'
import { boundsOfPoints } from '../../../geometry/bounds'
import { symbolFor } from '../../../model/objectKinds'
import type { GardenObject, Point } from '../../../model/schema'
import { objectStyle } from '../../../styles/elementStyles'
import { drawBoundary, drawOutlineObject, drawSymbol, tracePolygon } from './objectDrawing'

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
  const style = objectStyle(object)
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
  const style = objectStyle(object)
  const existing = object.status === 'existing'
  const bounds = boundsOfPoints(points)
  const half = thicknessM / 2
  return (
    <>
      {/* Wide invisible line so thin fences and walls are easy to click. */}
      <Line points={flat(points)} stroke="transparent" strokeWidth={14} {...fixedStroke} />
      <Shape
        ref={(node) => {
          if (node && bounds) {
            node.getSelfRect = () => ({
              x: bounds.minX - half,
              y: bounds.minY - half,
              width: bounds.maxX - bounds.minX + thicknessM,
              height: bounds.maxY - bounds.minY + thicknessM,
            })
          }
        }}
        listening={false}
        sceneFunc={(context, shape) =>
          drawBoundary(
            context._context,
            object.kind,
            points,
            thicknessM,
            style,
            { selected, existing },
            pxPerM(shape),
          )
        }
        perfectDrawEnabled={false}
      />
    </>
  )
}

function SymbolShape({ object, at, selected }: Omit<Props, 'points'> & { at: Point }) {
  const style = objectStyle(object)
  const existing = object.status === 'existing'
  const symbol = symbolFor(object.kind, object.variant)
  if (!symbol) return null
  const w = symbol.widthM
  const d = symbol.depthM
  return (
    <Shape
      // A custom shape has no size of its own; the Transformer measures this box.
      ref={(node) => {
        if (node) {
          node.getSelfRect = () => ({ x: at.x - w / 2, y: at.y - d / 2, width: w, height: d })
        }
      }}
      sceneFunc={(context, shape) =>
        drawSymbol(
          context._context,
          object.kind,
          symbol,
          at,
          style,
          { selected, existing },
          pxPerM(shape),
        )
      }
      hitFunc={(context, shape) => {
        context.beginPath()
        if (symbol.round) context.arc(at.x, at.y, w / 2, 0, Math.PI * 2)
        else context.rect(at.x - w / 2, at.y - d / 2, w, d)
        context.closePath()
        context.fillStrokeShape(shape)
      }}
      perfectDrawEnabled={false}
    />
  )
}
