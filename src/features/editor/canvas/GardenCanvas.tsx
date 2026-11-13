import type Konva from 'konva'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Group, Layer, Stage, Transformer } from 'react-konva'
import { scaleBarLength } from '../../../geometry/grid'
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
import { formatRoundLength } from '../../../i18n/units'
import {
  isLayerEditable,
  isLayerVisible,
  isPlotSelected,
  moveItems,
  transformObjects,
} from '../../../model/edit'
import { BACKGROUND_ID, BACKGROUND_LAYER } from '../../../model/background'
import { PLOT_ID, PLOT_LAYER, hasPlot } from '../../../model/plot'
import type { Point } from '../../../model/schema'
import { useProjectStore } from '../../../store/projectStore'
import { useUiStore } from '../../../store/uiStore'
import { SELECTION_COLOR } from '../../../styles/elementStyles'
import { currentSelection, editorActions } from '../actions'
import { CalibrationDraft, CalibrationLine } from './CalibrationOverlay'
import { CalibrationPanel } from './CalibrationPanel'
import { DrawingOverlay } from './DrawingOverlay'
import { DrawingPanel } from './DrawingPanel'
import styles from './GardenCanvas.module.css'
import { Grid } from './Grid'
import { type ItemHandlers, Items } from './Items'
import { PlotOverlay, PlotShape } from './Plot'
import { SitePlanLayer } from './SitePlan'
import { snapContext } from './snapTargets'
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
  const fit = useUiStore((s) => s.fit)
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
  const nodes = useRef(new Map<string, Konva.Group>())
  const transformer = useRef<Konva.Transformer>(null)
  const fittedProjectId = useRef<string | null>(null)

  const panMode = tool === 'pan' || spaceHeld
  const drawMode = tool === 'draw-plot' && !spaceHeld
  const calibrateMode = tool === 'calibrate' && !spaceHeld
  const interactive = tool === 'select' && !spaceHeld
  const selection = useMemo(() => new Set(selectionIds), [selectionIds])

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

  // Attach the rotate/resize handles to the selected objects (plantings only move).
  useEffect(() => {
    const tr = transformer.current
    if (!tr || !project) return
    const objectIds = new Set(project.objects.map((o) => o.id))
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
      mouseDown(id, event) {
        if (event.evt.button !== 0) return
        const ui = useUiStore.getState()
        if (event.evt.shiftKey) ui.toggleSelected(id)
        else if (!ui.selection.includes(id)) ui.setSelection([id])
      },
      dragStart(id, event) {
        // Shift-clicking a selected item deselects it: don't drag it then.
        if (!useUiStore.getState().selection.includes(id)) event.target.stopDrag()
      },
      dragMove(id, event) {
        const offset = event.target.position()
        for (const other of selectedIds()) {
          if (other !== id) nodes.current.get(other)?.position(offset)
        }
      },
      dragEnd(id, event) {
        const { x: dx, y: dy } = event.target.position()
        const ids = selectedIds().add(id)
        for (const other of ids) nodes.current.get(other)?.position({ x: 0, y: 0 })
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
    // Clicking empty space clears the selection.
    if (event.target === event.target.getStage() && !shiftKey) editorActions.clearSelection()
  }

  function onStageMouseMove(event: Konva.KonvaEventObject<MouseEvent>) {
    const pointer = event.target.getStage()?.getPointerPosition()
    if (!pointer) return
    const world = screenToWorld(pointer, useUiStore.getState().viewport)
    useUiStore.getState().setCursor(world)
    if (tool === 'draw-plot') setDrawCursor(drawingSnap(pointer, event.evt.altKey))
    if (tool === 'calibrate') setMeasureCursor(world)
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
      : drawMode || calibrateMode
        ? 'crosshair'
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
    drawing || calibration || !isEmpty
      ? null
      : !sitePlanVisible
        ? 'start'
        : sitePlanSelected
          ? null
          : 'trace'
  const barLength = scaleBarLength(viewport.scale)

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
        // While drawing or calibrating, keep the focus in the panel's input: without this, a click
        // on the plan moves the focus to the page (Konva's pointer events can't prevent that).
        onMouseDown={(e) => (tool === 'draw-plot' || tool === 'calibrate') && e.preventDefault()}
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
                />
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
              {drawing && (
                <DrawingOverlay
                  points={drawing.points}
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
      {drawing && <DrawingPanel towards={drawMode ? (drawCursor?.point ?? null) : null} />}
      {calibration && <CalibrationPanel />}
    </div>
  )
}
