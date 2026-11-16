import type Konva from 'konva'
import { memo } from 'react'
import { Group, Shape } from 'react-konva'
import { shapeFrameDeg, shapePoints } from '../../../geometry/frame'
import { applyMatrix, rotation } from '../../../geometry/transform'
import { isTreeCanopy, objectBand } from '../../../model/drawOrder'
import { isLayerEditable, isLayerVisible } from '../../../model/edit'
import { type DrawBand, editedByCorners } from '../../../model/objectKinds'
import { findPlant, plantingLayer } from '../../../model/plants'
import type { GardenObject, Point, Project } from '../../../model/schema'
import type { Severity } from '../../../model/warnings'
import type { LabelMode } from '../../../store/uiStore'
import {
  type PlantAppearance,
  type PlantView,
  plantAppearance,
} from '../../../styles/plantAppearance'
import { ObjectShape } from './ObjectShapes'
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

/** An object's outline or line while one of its corners is dragged (committed on release). */
export type ObjectDraft = { id: string; points: Point[] }

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
  objectDraft: ObjectDraft | null
  /** The year and month plants are drawn for (view bar). */
  view: PlantView
}

/**
 * The frame angle an object's group is turned by, so the Transformer's handles line up with the
 * object (see geometry/frame.ts). Beds edited by their corners stay unturned.
 */
function groupRotation(object: GardenObject): number {
  return editedByCorners(object.kind) ? 0 : shapeFrameDeg(object.shape)
}

/**
 * All objects and plantings in drawing order (bands: surfaces, beds, plants, structures, tree
 * canopies; see objectKinds.ts), then the plants' labels and warning badges on top. Memoised, so
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
  objectDraft,
  view,
}: ItemsProps) {
  const plantings = project.plantings.flatMap((planting) => {
    const layer = plantingLayer(project, planting)
    if (!isLayerVisible(project, layer)) return []
    const plant = findPlant(project, planting.plantId)
    const appearance = plantAppearance(plant, view, planting.plantedYear)
    return [{ planting, layer, appearance, canopy: isTreeCanopy(plant) }]
  })

  const objects = (band: DrawBand) =>
    project.objects.map((object) => {
      if (objectBand(object) !== band || !isLayerVisible(project, object.layer)) return null
      const angle = groupRotation(object)
      const toGroup = rotation(-angle)
      const points = objectDraft?.id === object.id ? objectDraft.points : shapePoints(object.shape)
      return (
        <ItemGroup
          key={object.id}
          id={object.id}
          rotation={angle}
          editable={isLayerEditable(project, object.layer)}
          interactive={interactive}
          handlers={handlers}
        >
          <ObjectShape
            object={object}
            points={angle === 0 ? points : points.map((p) => applyMatrix(toGroup, p))}
            selected={selection.has(object.id)}
          />
        </ItemGroup>
      )
    })

  const plants = (canopy: boolean) =>
    plantings.map(({ planting, layer, appearance, canopy: isCanopy }) =>
      isCanopy === canopy ? (
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
      ) : null,
    )

  return (
    <>
      {objects('surface')}
      {objects('bed')}
      {plants(false)}
      {objects('structure')}
      {plants(true)}
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
  /** The group's turn (degrees, clockwise): an object's frame angle, 0 for plants. */
  rotation?: number
  editable: boolean
  interactive: boolean
  handlers: ItemHandlers
  children: React.ReactNode
}

/**
 * Wraps each item in a group at (0, 0): dragging or transforming moves the group, and the change
 * is then baked into the item's coordinates (see GardenCanvas).
 */
function ItemGroup({
  id,
  rotation = 0,
  editable,
  interactive,
  handlers,
  children,
}: ItemGroupProps) {
  return (
    <Group
      id={id}
      rotation={rotation}
      // Read back when a transform is baked into the coordinates (GardenCanvas).
      frameDeg={rotation}
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
