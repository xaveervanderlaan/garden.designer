import type Konva from 'konva'
import { memo } from 'react'
import { Circle, Group, Line, Shape } from 'react-konva'
import { POINT_OBJECT_RADIUS_M } from '../../../geometry/bounds'
import { longestEdgeAngle } from '../../../geometry/planting'
import { type Bed, isBed } from '../../../model/beds'
import { isLayerEditable, isLayerVisible } from '../../../model/edit'
import { findPlant, plantingLayer } from '../../../model/plants'
import type { GardenObject, Point, Project } from '../../../model/schema'
import type { Severity } from '../../../model/warnings'
import type { LabelMode } from '../../../store/uiStore'
import { DEFAULT_STROKE_PX, OBJECT_STYLES, SELECTION_COLOR } from '../../../styles/elementStyles'
import { type PlantAppearance, plantAppearance } from '../../../styles/plantAppearance'
import {
  drawLabel,
  drawPlantSymbol,
  drawSelectionRing,
  drawWarningBadge,
  drawnRadius,
  labelWidthPx,
} from './plantDrawing'

export type ItemHandlers = {
  register: (id: string, node: Konva.Group | null) => void
  /** Where an item's group is dragged to at the moment (0, 0 when it isn't). */
  offset: (id: string) => Point
  mouseDown: (id: string, event: Konva.KonvaEventObject<MouseEvent>) => void
  dragStart: (id: string, event: Konva.KonvaEventObject<DragEvent>) => void
  dragMove: (id: string, event: Konva.KonvaEventObject<DragEvent>) => void
  dragEnd: (id: string, event: Konva.KonvaEventObject<DragEvent>) => void
  hover: (id: string | null) => void
}

/** A bed outline while one of its corners is dragged (committed on release). */
export type BedDraft = { id: string; points: Point[] }

const flat = (points: readonly Point[]) => points.flatMap((p) => [p.x, p.y])
/** Stroke widths in screen pixels, independent of zoom. */
const fixedStroke = { strokeScaleEnabled: false, perfectDrawEnabled: false } as const
/** Plants are at least this easy to click, however small they are on screen. */
const MIN_HIT_RADIUS_PX = 6
/** Codes are shown from this radius on screen, names (below the plant) from the next. */
const CODE_LABEL_MIN_RADIUS_PX = 6
const NAME_LABEL_MIN_RADIUS_PX = 10
/** A name may be this much wider than its plant (a gap between neighbours leaves room). */
const NAME_LABEL_OVERHANG = 1.6

/** Zoom (pixels per metre) of a shape inside the world group. */
const pxPerM = (shape: Konva.Node) => shape.getAbsoluteScale().x

type ItemsProps = {
  project: Project
  selection: ReadonlySet<string>
  /** False while panning or using another tool: items then ignore the mouse. */
  interactive: boolean
  handlers: ItemHandlers
  /** Plantings with a warning (they get a badge), and how serious it is. */
  warned: ReadonlyMap<string, Severity>
  /** Label text per planting, or null when labels are hidden. */
  labels: ReadonlyMap<string, string> | null
  labelMode: LabelMode
  bedDraft: BedDraft | null
}

/**
 * All objects and plantings, then the plants' labels and warning badges on top. Memoised, so
 * zooming and panning don't re-render them: everything sized in pixels is drawn by Konva
 * `sceneFunc`s that read the zoom when they draw.
 */
export const Items = memo(function Items({
  project,
  selection,
  interactive,
  handlers,
  warned,
  labels,
  labelMode,
  bedDraft,
}: ItemsProps) {
  const plantings = project.plantings.flatMap((planting) => {
    const layer = plantingLayer(project, planting)
    if (!isLayerVisible(project, layer)) return []
    const appearance = plantAppearance(findPlant(project, planting.plantId))
    return [{ planting, layer, appearance }]
  })

  return (
    <>
      {project.objects.map((object) =>
        isLayerVisible(project, object.layer) ? (
          <ItemGroup
            key={object.id}
            id={object.id}
            editable={isLayerEditable(project, object.layer)}
            interactive={interactive}
            handlers={handlers}
          >
            {isBed(object) ? (
              <BedShape
                bed={object}
                points={bedDraft?.id === object.id ? bedDraft.points : object.shape.points}
                selected={selection.has(object.id)}
              />
            ) : (
              <ObjectShape object={object} selected={selection.has(object.id)} />
            )}
          </ItemGroup>
        ) : null,
      )}
      {plantings.map(({ planting, layer, appearance }) => (
        <ItemGroup
          key={planting.id}
          id={planting.id}
          editable={isLayerEditable(project, layer)}
          interactive={interactive}
          handlers={handlers}
        >
          <PlantingShape
            at={planting.position}
            appearance={appearance}
            selected={selection.has(planting.id)}
          />
        </ItemGroup>
      ))}
      <PlantMarks
        marks={plantings.map(({ planting, appearance }) => ({
          id: planting.id,
          at: planting.position,
          radius: appearance.radiusM,
          label: labels?.get(planting.id),
          warning: warned.get(planting.id),
        }))}
        labelMode={labelMode}
        offset={handlers.offset}
      />
    </>
  )
})

type ItemGroupProps = {
  id: string
  editable: boolean
  interactive: boolean
  handlers: ItemHandlers
  children: React.ReactNode
}

/**
 * Wraps each item in a group at (0, 0): dragging or transforming moves the group, and the change
 * is then baked into the item's coordinates (see GardenCanvas).
 */
function ItemGroup({ id, editable, interactive, handlers, children }: ItemGroupProps) {
  return (
    <Group
      id={id}
      ref={(node) => handlers.register(id, node)}
      listening={editable && interactive}
      draggable={editable && interactive}
      onMouseDown={(e) => handlers.mouseDown(id, e)}
      onDragStart={(e) => handlers.dragStart(id, e)}
      onDragMove={(e) => handlers.dragMove(id, e)}
      onDragEnd={(e) => handlers.dragEnd(id, e)}
      onMouseEnter={() => handlers.hover(id)}
      onMouseLeave={() => handlers.hover(null)}
    >
      {children}
    </Group>
  )
}

function ObjectShape({ object, selected }: { object: GardenObject; selected: boolean }) {
  const style = OBJECT_STYLES[object.kind]
  const stroke = selected ? SELECTION_COLOR : style.stroke
  const strokeWidth = selected ? 2.5 : (style.strokeWidthPx ?? DEFAULT_STROKE_PX)
  const shape = object.shape

  switch (shape.type) {
    case 'polygon':
      return (
        <Line
          points={flat(shape.points)}
          closed
          fill={style.fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          {...fixedStroke}
        />
      )
    case 'polyline':
      return (
        <>
          {/* Wide invisible line so thin fences and walls are easy to click. */}
          <Line
            points={flat(shape.points)}
            stroke="transparent"
            strokeWidth={14}
            {...fixedStroke}
          />
          <Line
            points={flat(shape.points)}
            stroke={selected ? SELECTION_COLOR : style.fill}
            strokeWidth={shape.thicknessM}
            lineCap="round"
            lineJoin="round"
            perfectDrawEnabled={false}
          />
        </>
      )
    case 'point':
      return (
        <Circle
          x={shape.position.x}
          y={shape.position.y}
          radius={POINT_OBJECT_RADIUS_M}
          fill={style.fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          {...fixedStroke}
        />
      )
  }
}

function tracePolygon(ctx: CanvasRenderingContext2D | Konva.Context, points: readonly Point[]) {
  ctx.beginPath()
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
  ctx.closePath()
}

/** Parallel lines across the polygon, `spacing` apart, along its longest edge. */
function drawRows(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  spacing: number,
  color: string,
  px: number,
) {
  const angle = longestEdgeAngle(points)
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  // Coordinates along (u) and across (v) the rows.
  const us = points.map((p) => p.x * cos + p.y * sin)
  const vs = points.map((p) => -p.x * sin + p.y * cos)
  const minU = Math.min(...us)
  const maxU = Math.max(...us)
  const maxV = Math.max(...vs)
  ctx.beginPath()
  for (let v = Math.min(...vs) + spacing / 2; v < maxV; v += spacing) {
    ctx.moveTo(minU * cos - v * sin, minU * sin + v * cos)
    ctx.lineTo(maxU * cos - v * sin, maxU * sin + v * cos)
  }
  ctx.strokeStyle = color
  ctx.lineWidth = px
  ctx.stroke()
}

/** A bed: soil-coloured polygon with its outline, plus row lines for a vegetable bed. */
function BedShape({
  bed,
  points,
  selected,
}: {
  bed: Bed
  points: readonly Point[]
  selected: boolean
}) {
  const style = OBJECT_STYLES[bed.kind]
  return (
    <Shape
      sceneFunc={(context, shape) => {
        const ctx = context._context
        const px = 1 / pxPerM(shape)
        tracePolygon(ctx, points)
        ctx.fillStyle = style.fill
        ctx.fill()
        const pattern = style.pattern
        // Rows closer than a few pixels would only make the bed look grey.
        if (pattern && pattern.spacingM / px >= 6) {
          ctx.save()
          tracePolygon(ctx, points)
          ctx.clip()
          drawRows(ctx, points, pattern.spacingM, pattern.color, px)
          ctx.restore()
        }
        tracePolygon(ctx, points)
        ctx.lineJoin = 'round'
        ctx.strokeStyle = selected ? SELECTION_COLOR : style.stroke
        ctx.lineWidth = (selected ? 2.5 : (style.strokeWidthPx ?? DEFAULT_STROKE_PX)) * px
        ctx.stroke()
      }}
      hitFunc={(context, shape) => {
        tracePolygon(context, points)
        context.fillStrokeShape(shape)
      }}
      perfectDrawEnabled={false}
    />
  )
}

function PlantingShape({
  at,
  appearance,
  selected,
}: {
  at: Point
  appearance: PlantAppearance
  selected: boolean
}) {
  return (
    <Shape
      sceneFunc={(context, shape) => {
        const ctx = context._context
        const scale = pxPerM(shape)
        drawPlantSymbol(ctx, appearance, at, appearance.radiusM, scale)
        if (selected) drawSelectionRing(ctx, at, appearance.radiusM, scale)
      }}
      hitFunc={(context, shape) => {
        const scale = pxPerM(shape)
        const r = Math.max(drawnRadius(appearance.radiusM, scale), MIN_HIT_RADIUS_PX / scale)
        context.beginPath()
        context.arc(at.x, at.y, r, 0, 2 * Math.PI)
        context.closePath()
        context.fillStrokeShape(shape)
      }}
      perfectDrawEnabled={false}
    />
  )
}

type Mark = { id: string; at: Point; radius: number; label?: string; warning?: Severity }

/**
 * Labels and warning badges of all plants, drawn by one shape on top of every symbol. It follows
 * plants that are being dragged (their group's offset).
 */
function PlantMarks({
  marks,
  labelMode,
  offset,
}: {
  marks: readonly Mark[]
  labelMode: LabelMode
  offset: (id: string) => Point
}) {
  if (!marks.some((m) => m.label || m.warning)) return null
  return (
    <Shape
      listening={false}
      perfectDrawEnabled={false}
      sceneFunc={(context, shape) => {
        const ctx = context._context
        const scale = pxPerM(shape)
        const minRadius =
          (labelMode === 'code' ? CODE_LABEL_MIN_RADIUS_PX : NAME_LABEL_MIN_RADIUS_PX) / scale
        for (const mark of marks) {
          if (!mark.label || mark.radius < minRadius) continue
          const o = offset(mark.id)
          const at = { x: mark.at.x + o.x, y: mark.at.y + o.y }
          if (labelMode === 'code') {
            drawLabel(ctx, mark.label, at, scale, { bold: true, baseline: 'middle' })
          } else {
            // Names only where they fit, roughly: plants in a dense bed would bury each other's.
            const r = drawnRadius(mark.radius, scale)
            if (labelWidthPx(ctx, mark.label) > 2 * r * scale * NAME_LABEL_OVERHANG) continue
            drawLabel(ctx, mark.label, { x: at.x, y: at.y + r + 2 / scale }, scale)
          }
        }
        for (const mark of marks) {
          if (!mark.warning) continue
          const o = offset(mark.id)
          drawWarningBadge(
            ctx,
            { x: mark.at.x + o.x, y: mark.at.y + o.y },
            mark.radius,
            scale,
            mark.warning,
          )
        }
      }}
    />
  )
}
