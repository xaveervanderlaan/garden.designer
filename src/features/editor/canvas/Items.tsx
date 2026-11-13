import type Konva from 'konva'
import { memo } from 'react'
import { Circle, Group, Line } from 'react-konva'
import { POINT_OBJECT_RADIUS_M } from '../../../geometry/bounds'
import { isLayerEditable, isLayerVisible } from '../../../model/edit'
import { plantingLayer, plantingRadiusM } from '../../../model/plants'
import type { GardenObject, Planting, Point, Project } from '../../../model/schema'
import {
  OBJECT_STYLES,
  PLANTING_STYLE,
  PLOT_STYLE,
  SELECTION_COLOR,
} from '../../../styles/elementStyles'

export type ItemHandlers = {
  register: (id: string, node: Konva.Group | null) => void
  mouseDown: (id: string, event: Konva.KonvaEventObject<MouseEvent>) => void
  dragStart: (id: string, event: Konva.KonvaEventObject<DragEvent>) => void
  dragMove: (id: string, event: Konva.KonvaEventObject<DragEvent>) => void
  dragEnd: (id: string, event: Konva.KonvaEventObject<DragEvent>) => void
  hover: (id: string | null) => void
}

const flat = (points: readonly Point[]) => points.flatMap((p) => [p.x, p.y])
/** Stroke widths in screen pixels, independent of zoom. */
const fixedStroke = { strokeScaleEnabled: false, perfectDrawEnabled: false } as const

export function PlotOutline({ outline }: { outline: readonly Point[] }) {
  if (outline.length < 2) return null
  return (
    <Line
      points={flat(outline)}
      closed={outline.length > 2}
      fill={PLOT_STYLE.fill}
      stroke={PLOT_STYLE.stroke}
      strokeWidth={2.5}
      listening={false}
      {...fixedStroke}
    />
  )
}

type ItemsProps = {
  project: Project
  selection: ReadonlySet<string>
  /** False while panning: items then ignore the mouse. */
  interactive: boolean
  handlers: ItemHandlers
}

/** All objects and plantings. Memoised, so zooming and panning don't re-render them. */
export const Items = memo(function Items({
  project,
  selection,
  interactive,
  handlers,
}: ItemsProps) {
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
            <ObjectShape object={object} selected={selection.has(object.id)} />
          </ItemGroup>
        ) : null,
      )}
      {project.plantings.map((planting) => {
        const layer = plantingLayer(project, planting)
        return isLayerVisible(project, layer) ? (
          <ItemGroup
            key={planting.id}
            id={planting.id}
            editable={isLayerEditable(project, layer)}
            interactive={interactive}
            handlers={handlers}
          >
            <PlantingShape
              planting={planting}
              radius={plantingRadiusM(project, planting)}
              selected={selection.has(planting.id)}
            />
          </ItemGroup>
        ) : null
      })}
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
  const shape = object.shape

  switch (shape.type) {
    case 'polygon':
      return (
        <Line
          points={flat(shape.points)}
          closed
          fill={style.fill}
          stroke={stroke}
          strokeWidth={selected ? 2.5 : 1.25}
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
          strokeWidth={selected ? 2.5 : 1.25}
          {...fixedStroke}
        />
      )
  }
}

function PlantingShape({
  planting,
  radius,
  selected,
}: {
  planting: Planting
  radius: number
  selected: boolean
}) {
  return (
    <Circle
      x={planting.position.x}
      y={planting.position.y}
      radius={radius}
      fill={PLANTING_STYLE.fill}
      stroke={selected ? SELECTION_COLOR : PLANTING_STYLE.stroke}
      strokeWidth={selected ? 2.5 : 1.25}
      {...fixedStroke}
    />
  )
}
