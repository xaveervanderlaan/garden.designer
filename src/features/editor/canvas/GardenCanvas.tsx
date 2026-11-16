import type Konva from 'konva'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Group, Layer, Stage, Transformer } from 'react-konva'
import { scaleBarLength } from '../../../geometry/grid'
import { rowPositions } from '../../../geometry/planting'
import { isSelfIntersecting } from '../../../geometry/polygon'
import { type Snap, snapPoint } from '../../../geometry/snap'
import type { Matrix } from '../../../geometry/transform'
import {
  fitBounds,
  isTrackpadPan,
  panBy,
  screenToWorld,
  wheelDeltaPx,
  wheelZoomFactor,
  zoomAt,
} from '../../../geometry/viewport'
import { currentLanguage } from '../../../i18n'
import { formatRoundLength } from '../../../i18n/units'
import { bedAt, findBed, isBed, withPlantsInBeds } from '../../../model/beds'
import {
  isLayerEditable,
  isLayerVisible,
  isPlotSelected,
  moveItems,
  transformObjects,
} from '../../../model/edit'
import { BACKGROUND_ID, BACKGROUND_LAYER } from '../../../model/background'
import { findPlant } from '../../../model/plants'
import { fillBedPositions, plantingLabels } from '../../../model/plantings'
import { PLOT_ID, PLOT_LAYER, hasPlot } from '../../../model/plot'
import type { Point } from '../../../model/schema'
import { designWarnings, warningsByPlanting, worstSeverity } from '../../../model/warnings'
import { useProjectStore } from '../../../store/projectStore'
import { useUiStore } from '../../../store/uiStore'
import { SELECTION_COLOR } from '../../../styles/elementStyles'
import { plantAppearance } from '../../../styles/plantAppearance'
import { PLANT_DRAG_TYPE } from '../../library/drag'
import { useLibraryStore } from '../../library/libraryStore'
import { currentSelection, currentYear, editorActions } from '../actions'
import { usePlantView } from '../view/plantView'
import { BedOverlay } from './BedOverlay'
import { CalibrationDraft, CalibrationLine } from './CalibrationOverlay'
import { CalibrationPanel } from './CalibrationPanel'
import { DrawingOverlay } from './DrawingOverlay'
import { DrawingPanel } from './DrawingPanel'
import styles from './GardenCanvas.module.css'
import { FillPanel } from './FillPanel'
import { Grid } from './Grid'
import { type BedDraft, type ItemHandlers, Items } from './Items'
import { PlantPreview } from './PlantPreview'
import { PlotOverlay, PlotShape } from './Plot'
import { SitePlanLayer } from './SitePlan'
import { snapContext } from './snapTargets'
import { StampPanel } from './StampPanel'
import { useAltKey } from './useAltKey'
import { useElementSize } from './useElementSize'
import { useSpaceKey } from './useSpaceKey'

const ROTATION_SNAPS = [0, 45, 90, 135, 180, 225, 270, 315]

/** The plan: a Konva stage with the grid, plot and items. Loaded lazily (Konva is big). */
export default function GardenCanvas() {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const size = useElementSize(containerRef)
  const project = useProjectStore((s) => s.project)
  const viewport = useUiStore((s) => s.viewport)
  const selectionIds = useUiStore((s) => s.selection)
  const tool = useUiStore((s) => s.tool)
  const drawing = useUiStore((s) => s.drawing)
  const calibration = useUiStore((s) => s.calibration)
  const stamp = useUiStore((s) => s.stamp)
  const fill = useUiStore((s) => s.fill)
  const labelMode = useUiStore((s) => s.labelMode)
  const fit = useUiStore((s) => s.fit)
  const view = usePlantView(project)
  const spaceHeld = useSpaceKey()
  const altHeld = useAltKey()
  const [panning, setPanning] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)
  /** The plot outline while a corner is being dragged (committed on release). */
  const [plotDraft, setPlotDraft] = useState<Point[] | null>(null)
  /** The snapped cursor while drawing. */
  const [drawCursor, setDrawCursor] = useState<Snap | null>(null)
  /** The cursor (world, not snapped) while calibrating. */
  const [measureCursor, setMeasureCursor] = useState<Point | null>(null)
  /** The cursor (world) while stamping plants. */
  const [stampCursor, setStampCursor] = useState<Point | null>(null)
  /** A plant dragged from the library over the plan, and where it would land. */
  const [dropAt, setDropAt] = useState<{ plantId: string; point: Point } | null>(null)
  /** A bed outline while one of its corners is being dragged. */
  const [bedDraft, setBedDraft] = useState<BedDraft | null>(null)
  const nodes = useRef(new Map<string, Konva.Group>())
  /** Ids of the items moving along with the one being dragged. */
  const dragging = useRef<ReadonlySet<string>>(new Set())
  const transformer = useRef<Konva.Transformer>(null)
  const fittedProjectId = useRef<string | null>(null)

  const panMode = tool === 'pan' || spaceHeld
  const drawMode = tool === 'draw' && !spaceHeld
  const calibrateMode = tool === 'calibrate' && !spaceHeld
  const stampMode = tool === 'stamp' && !spaceHeld
  const fillMode = tool === 'fill' && !spaceHeld
  const interactive = tool === 'select' && !spaceHeld
  const selection = useMemo(() => new Set(selectionIds), [selectionIds])
  const lang = currentLanguage()

  const warned = useMemo(
    () =>
      new Map(
        project
          ? [...warningsByPlanting(designWarnings(project, view.year))].map(([id, list]) => [
              id,
              worstSeverity(list),
            ])
          : [],
      ),
    [project, view.year],
  )
  const labelsVisible = !!project && isLayerVisible(project, 'labels')
  const labels = useMemo(
    () => (project && labelsVisible ? plantingLabels(project, labelMode, lang) : null),
    [project, labelsVisible, labelMode, lang],
  )
  const fillPositions = useMemo(
    () =>
      project && fill?.bedId
        ? fillBedPositions(project, fill.bedId, fill.plantId, fill.spacingM).positions
        : [],
    [project, fill],
  )

  useEffect(() => {
    if (size) useUiStore.getState().setCanvasSize(size)
  }, [size])

  // Keep a fitted view fitted when the plan's size changes: when a panel below it opens or
  // closes (also in the same update as the fit itself, e.g. when calibrating starts) or the window
  // is resized. Measured directly, so it's right before the first paint. It stops once you pan,
  // zoom or click on the plan, so the view never moves under the cursor while you work.
  useLayoutEffect(() => {
    const element = containerRef.current
    const { viewport: current, setViewport, setFit } = useUiStore.getState()
    if (!element || !fit || current !== fit.viewport) return
    const width = Math.floor(element.clientWidth)
    const height = Math.floor(element.clientHeight)
    if (width <= 0 || height <= 0) return
    const next = fitBounds(fit.bounds, { width, height })
    if (next.x === current.x && next.y === current.y && next.scale === current.scale) return
    setViewport(next)
    setFit({ bounds: fit.bounds, viewport: next })
  }, [fit, size])

  // Zoom to fit when a design is opened.
  useEffect(() => {
    if (size && project && fittedProjectId.current !== project.id) {
      fittedProjectId.current = project.id
      editorActions.designOpened()
    }
  }, [size, project])

  // Attach the rotate/resize handles to the selected objects. Plantings only move; beds have
  // corner handles instead (like the plot).
  useEffect(() => {
    const tr = transformer.current
    if (!tr || !project) return
    const objectIds = new Set(project.objects.filter((o) => !isBed(o)).map((o) => o.id))
    const attached = !interactive
      ? []
      : currentSelection()
          .filter((id) => objectIds.has(id))
          .map((id) => nodes.current.get(id))
          .filter((node): node is Konva.Group => !!node)
    tr.nodes(attached)
    tr.forceUpdate()
    tr.getLayer()?.batchDraw()
  }, [project, selectionIds, interactive])

  const handlers = useMemo<ItemHandlers>(() => {
    const selectedIds = () => new Set(currentSelection())
    return {
      register(id, node) {
        if (node) nodes.current.set(id, node)
        else nodes.current.delete(id)
      },
      offset: (id) => nodes.current.get(id)?.position() ?? { x: 0, y: 0 },
      mouseDown(id, event) {
        if (event.evt.button !== 0) return
        const ui = useUiStore.getState()
        if (event.evt.shiftKey) ui.toggleSelected(id)
        else if (!ui.selection.includes(id)) ui.setSelection([id])
      },
      dragStart(id, event) {
        // Shift-clicking a selected item deselects it: don't drag it then.
        if (!useUiStore.getState().selection.includes(id)) {
          event.target.stopDrag()
          return
        }
        // Everything that moves along: the selection, and the plants in selected beds.
        const project = useProjectStore.getState().project
        const ids = selectedIds().add(id)
        dragging.current = project ? withPlantsInBeds(project, ids) : ids
      },
      dragMove(id, event) {
        const offset = event.target.position()
        for (const other of dragging.current) {
          if (other !== id) nodes.current.get(other)?.position(offset)
        }
      },
      dragEnd(id, event) {
        const { x: dx, y: dy } = event.target.position()
        const ids = selectedIds().add(id)
        for (const other of new Set([...ids, ...dragging.current])) {
          nodes.current.get(other)?.position({ x: 0, y: 0 })
        }
        dragging.current = new Set()
        // One update per drag, so a drag is one undo step.
        if (dx !== 0 || dy !== 0)
          useProjectStore.getState().update((p) => moveItems(p, ids, dx, dy))
      },
      hover: setHovered,
    }
  }, [])

  if (!project) return null

  function onTransformEnd() {
    const tr = transformer.current
    if (!tr) return
    const transforms = new Map<string, Matrix>()
    for (const node of tr.nodes()) {
      // Copy the numbers: Konva reuses its Transform object, and resetting the node below
      // recomputes that same array in place (to the identity).
      const [a, b, c, d, e, f] = node.getTransform().getMatrix()
      transforms.set(node.id(), [a!, b!, c!, d!, e!, f!])
      node.setAttrs({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0 })
    }
    useProjectStore.getState().update((p) => transformObjects(p, transforms))
  }

  function startPan(event: MouseEvent) {
    event.preventDefault()
    setPanning(true)
    let last = { x: event.clientX, y: event.clientY }
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - last.x
      const dy = e.clientY - last.y
      last = { x: e.clientX, y: e.clientY }
      useUiStore.getState().setViewport((vp) => panBy(vp, dx, dy))
    }
    const onUp = () => {
      setPanning(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  /** The snapped world point for a screen position while drawing (Alt turns snapping off). */
  function drawingSnap(screen: Point, alt: boolean): Snap {
    const { viewport: vp, drawing: current, snapToGrid } = useUiStore.getState()
    const raw = screenToWorld(screen, vp)
    if (alt || !project) return { point: raw, kind: null }
    const points = current?.points ?? []
    return snapPoint(
      raw,
      snapContext(project, {
        scale: vp.scale,
        snapToGrid,
        drawing: points,
        anchor: points.at(-1),
      }),
    )
  }

  function onStageMouseDown(event: Konva.KonvaEventObject<MouseEvent>) {
    const { button, shiftKey, altKey } = event.evt
    // Working on the plan: from now on the view must not move by itself (see the fit effect).
    if (useUiStore.getState().fit) useUiStore.getState().setFit(null)
    if (button === 1 || (button === 0 && panMode)) {
      startPan(event.evt)
      return
    }
    if (button !== 0) return
    if (drawMode) {
      const pointer = event.target.getStage()?.getPointerPosition()
      if (pointer) editorActions.addDrawingPoint(drawingSnap(pointer, altKey).point)
      return
    }
    if (calibrateMode) {
      // No snapping: the points are spots on the site plan, wherever they are.
      const pointer = event.target.getStage()?.getPointerPosition()
      if (pointer) editorActions.addCalibrationPoint(screenToWorld(pointer, viewport))
      return
    }
    if (stampMode || fillMode) {
      const pointer = event.target.getStage()?.getPointerPosition()
      if (!pointer) return
      const world = screenToWorld(pointer, viewport)
      if (stampMode) editorActions.stampAt(world)
      else editorActions.chooseFillBed(world)
      return
    }
    // Clicking empty space clears the selection.
    if (event.target === event.target.getStage() && !shiftKey) editorActions.clearSelection()
  }

  function onStageMouseMove(event: Konva.KonvaEventObject<MouseEvent>) {
    const pointer = event.target.getStage()?.getPointerPosition()
    if (!pointer) return
    const world = screenToWorld(pointer, useUiStore.getState().viewport)
    useUiStore.getState().setCursor(world)
    if (tool === 'draw') setDrawCursor(drawingSnap(pointer, event.evt.altKey))
    if (tool === 'calibrate') setMeasureCursor(world)
    if (tool === 'stamp') setStampCursor(world)
    if (tool === 'fill') setHovered(project && bedAt(project, world) ? 'fill-bed' : null)
  }

  /** World position of a mouse event on the plan area (for drag and drop). */
  function eventToWorld(event: React.DragEvent): Point {
    const rect = containerRef.current!.getBoundingClientRect()
    return screenToWorld(
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
      useUiStore.getState().viewport,
    )
  }

  function onDragOver(event: React.DragEvent) {
    const plantId = useLibraryStore.getState().dragging
    if (!plantId || !event.dataTransfer.types.includes(PLANT_DRAG_TYPE)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setDropAt({ plantId, point: eventToWorld(event) })
  }

  function onDrop(event: React.DragEvent) {
    const plantId =
      event.dataTransfer.getData(PLANT_DRAG_TYPE) || useLibraryStore.getState().dragging
    setDropAt(null)
    if (!plantId) return
    event.preventDefault()
    if (useUiStore.getState().fit) useUiStore.getState().setFit(null)
    editorActions.placePlant(plantId, eventToWorld(event))
  }

  function onWheel(event: Konva.KonvaEventObject<WheelEvent>) {
    event.evt.preventDefault()
    const pointer = event.target.getStage()?.getPointerPosition()
    if (!pointer) return
    const e = event.evt
    const dx = wheelDeltaPx(e.deltaX, e.deltaMode)
    const dy = wheelDeltaPx(e.deltaY, e.deltaMode)
    const { setViewport } = useUiStore.getState()
    if (isTrackpadPan(e)) setViewport((vp) => panBy(vp, -dx, -dy))
    else setViewport((vp) => zoomAt(vp, pointer, wheelZoomFactor(dy, e.ctrlKey)))
  }

  function onPlotMouseDown(event: Konva.KonvaEventObject<MouseEvent>) {
    if (event.evt.button !== 0) return
    const ui = useUiStore.getState()
    if (event.evt.shiftKey) ui.toggleSelected(PLOT_ID)
    else if (!ui.selection.includes(PLOT_ID)) ui.setSelection([PLOT_ID])
  }

  const outline = plotDraft ?? project.plot.outline
  const editedBed =
    interactive && selectionIds.length === 1 ? findBed(project, selectionIds[0]!) : undefined
  const editingBed = editedBed && isLayerEditable(project, editedBed.layer) ? editedBed : undefined
  const preview = previewOf()
  const plotVisible = isLayerVisible(project, PLOT_LAYER)
  const plotEditable = isLayerEditable(project, PLOT_LAYER)
  const editingPlot = interactive && isPlotSelected(project, selectionIds)
  const background = project.background
  const sitePlanVisible = !!background && isLayerVisible(project, BACKGROUND_LAYER)
  const sitePlanSelected = selection.has(BACKGROUND_ID)
  const cursor = panning
    ? 'grabbing'
    : panMode
      ? 'grab'
      : drawMode || calibrateMode || stampMode
        ? 'crosshair'
        : fillMode
          ? hovered === 'fill-bed'
            ? 'pointer'
            : 'default'
          : hovered === PLOT_ID
            ? 'pointer'
            : hovered === BACKGROUND_ID
              ? sitePlanSelected
                ? 'move'
                : 'default'
              : hovered
                ? 'move'
                : 'default'
  const isEmpty =
    !hasPlot(project) && project.objects.length === 0 && project.plantings.length === 0
  // While the site plan is selected its rotate handle is at the top, where the hint would be.
  const hint =
    drawing || calibration || stamp || fill || !isEmpty
      ? null
      : !sitePlanVisible
        ? 'start'
        : sitePlanSelected
          ? null
          : 'trace'
  const barLength = scaleBarLength(viewport.scale)

  /** Plants to preview: a fill, a row being drawn, the stamp under the cursor, or a drop. */
  function previewOf() {
    if (!project) return null
    const of = (plantId: string, positions: Point[]) => ({
      // New plants are planted this year.
      appearance: plantAppearance(findPlant(project, plantId), view, currentYear()),
      positions,
    })
    if (dropAt) return of(dropAt.plantId, [dropAt.point])
    if (fill && fillMode) return of(fill.plantId, fillPositions)
    if (stamp && stampMode && stampCursor) return of(stamp.plantId, [stampCursor])
    if (drawing?.target.kind === 'row') {
      // The row as it is; while placing its end point, up to the cursor.
      const points = drawing.points
      const line =
        points.length === 1 && drawMode && drawCursor ? [points[0]!, drawCursor.point] : points
      return of(drawing.target.plantId, rowPositions(line, drawing.target.spacingM))
    }
    return null
  }

  return (
    <div
      className={styles.canvas}
      role="region"
      aria-label={t('editor.canvas.label')}
      data-testid="garden-canvas"
    >
      <div
        ref={containerRef}
        className={styles.stageArea}
        data-testid="plan-area"
        style={{ cursor }}
        // While drawing, calibrating or filling, keep the focus in the panel's input: without this,
        // a click on the plan moves the focus to the page (Konva's pointer events can't prevent
        // that).
        onMouseDown={(e) =>
          (tool === 'draw' || tool === 'calibrate' || tool === 'fill') && e.preventDefault()
        }
        onDragOver={onDragOver}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropAt(null)
        }}
        onDrop={onDrop}
      >
        {size && (
          <Stage
            width={size.width}
            height={size.height}
            onMouseDown={onStageMouseDown}
            onMouseMove={onStageMouseMove}
            onMouseLeave={() => {
              useUiStore.getState().setCursor(null)
              setDrawCursor(null)
              setMeasureCursor(null)
              setStampCursor(null)
            }}
            onWheel={onWheel}
            onContextMenu={(e) => e.evt.preventDefault()}
          >
            <Layer listening={false}>
              <Grid viewport={viewport} size={size} />
            </Layer>
            {background && sitePlanVisible && (
              <SitePlanLayer
                background={background}
                viewport={viewport}
                selectable={interactive && isLayerEditable(project, BACKGROUND_LAYER)}
                selected={sitePlanSelected}
                onHover={(on) => setHovered(on ? BACKGROUND_ID : null)}
              />
            )}
            <Layer>
              <Group x={viewport.x} y={viewport.y} scaleX={viewport.scale} scaleY={viewport.scale}>
                {plotVisible && (
                  <PlotShape
                    outline={outline}
                    selectable={interactive && plotEditable}
                    selected={selection.has(PLOT_ID)}
                    warning={outline.length > 3 && isSelfIntersecting(outline)}
                    onMouseDown={onPlotMouseDown}
                    onHover={(on) => setHovered(on ? PLOT_ID : null)}
                  />
                )}
                <Items
                  project={project}
                  selection={selection}
                  interactive={interactive}
                  handlers={handlers}
                  warned={warned}
                  labels={labels}
                  labelMode={labelMode}
                  bedDraft={bedDraft}
                  view={view}
                />
                {preview && (
                  <PlantPreview appearance={preview.appearance} positions={preview.positions} />
                )}
              </Group>
              <Transformer
                ref={transformer}
                rotationSnaps={ROTATION_SNAPS}
                rotationSnapTolerance={4}
                keepRatio={false}
                ignoreStroke
                anchorSize={9}
                anchorStroke={SELECTION_COLOR}
                borderStroke={SELECTION_COLOR}
                borderDash={[4, 3]}
                boundBoxFunc={(oldBox, newBox) =>
                  Math.abs(newBox.width) < 4 || Math.abs(newBox.height) < 4 ? oldBox : newBox
                }
                onTransformEnd={onTransformEnd}
              />
            </Layer>
            <Layer>
              {plotVisible && (
                <PlotOverlay
                  project={project}
                  outline={outline}
                  viewport={viewport}
                  showLabels={isLayerVisible(project, 'measurements')}
                  editing={editingPlot}
                  altHeld={altHeld}
                  onDraft={setPlotDraft}
                />
              )}
              {editingBed && (
                <BedOverlay
                  key={editingBed.id}
                  project={project}
                  bed={editingBed}
                  outline={
                    bedDraft?.id === editingBed.id ? bedDraft.points : editingBed.shape.points
                  }
                  viewport={viewport}
                  showLabels={isLayerVisible(project, 'measurements')}
                  altHeld={altHeld}
                  onDraft={(points) => setBedDraft(points && { id: editingBed.id, points })}
                />
              )}
              {drawing && (
                <DrawingOverlay
                  points={drawing.points}
                  closed={drawing.target.kind !== 'row'}
                  cursor={drawMode ? drawCursor : null}
                  viewport={viewport}
                />
              )}
              {calibration && (
                <CalibrationDraft
                  points={calibration.points}
                  cursor={calibrateMode ? measureCursor : null}
                  viewport={viewport}
                />
              )}
              {background && sitePlanVisible && sitePlanSelected && !calibration && (
                <CalibrationLine background={background} viewport={viewport} />
              )}
            </Layer>
          </Stage>
        )}

        {hint && (
          <p className={styles.emptyHint}>
            {hint === 'trace' ? t('editor.canvas.traceHint') : t('editor.canvas.emptyHint')}
          </p>
        )}

        <div
          className={styles.scaleBar}
          role="img"
          aria-label={t('editor.canvas.scaleBar', { length: formatRoundLength(barLength) })}
        >
          <span className={styles.scaleBarLine} style={{ width: barLength * viewport.scale }} />
          <span>{formatRoundLength(barLength)}</span>
        </div>
      </div>

      {/* Below the plan, not on top of it, so it never hides a spot you want to click. */}
      {drawing && (
        <DrawingPanel
          // A new drawing (e.g. a row of another plant) starts with fresh fields.
          key={drawing.target.kind === 'row' ? drawing.target.plantId : drawing.target.kind}
          towards={drawMode ? (drawCursor?.point ?? null) : null}
        />
      )}
      {calibration && <CalibrationPanel />}
      {stamp && <StampPanel project={project} />}
      {fill && <FillPanel key={fill.plantId} project={project} count={fillPositions.length} />}
    </div>
  )
}
