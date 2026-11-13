import type Konva from 'konva'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Group, Layer, Stage, Transformer } from 'react-konva'
import { scaleBarLength } from '../../../geometry/grid'
import type { Matrix } from '../../../geometry/transform'
import {
  isTrackpadPan,
  panBy,
  screenToWorld,
  wheelDeltaPx,
  wheelZoomFactor,
  zoomAt,
} from '../../../geometry/viewport'
import { formatRoundLength } from '../../../i18n/units'
import { moveItems, transformObjects } from '../../../model/edit'
import { useProjectStore } from '../../../store/projectStore'
import { useUiStore } from '../../../store/uiStore'
import { SELECTION_COLOR } from '../../../styles/elementStyles'
import { currentSelection, editorActions } from '../actions'
import styles from './GardenCanvas.module.css'
import { Grid } from './Grid'
import { type ItemHandlers, Items, PlotOutline } from './Items'
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
  const spaceHeld = useSpaceKey()
  const [panning, setPanning] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)
  const nodes = useRef(new Map<string, Konva.Group>())
  const transformer = useRef<Konva.Transformer>(null)
  const fittedProjectId = useRef<string | null>(null)

  const panMode = tool === 'pan' || spaceHeld
  const selection = useMemo(() => new Set(selectionIds), [selectionIds])

  useEffect(() => {
    if (size) useUiStore.getState().setCanvasSize(size)
  }, [size])

  // Zoom to fit when a design is opened.
  useEffect(() => {
    if (size && project && fittedProjectId.current !== project.id) {
      fittedProjectId.current = project.id
      editorActions.zoomToFit()
    }
  }, [size, project])

  // Attach the rotate/resize handles to the selected objects (plantings only move).
  useEffect(() => {
    const tr = transformer.current
    if (!tr || !project) return
    const objectIds = new Set(project.objects.map((o) => o.id))
    const attached = panMode
      ? []
      : currentSelection()
          .filter((id) => objectIds.has(id))
          .map((id) => nodes.current.get(id))
          .filter((node): node is Konva.Group => !!node)
    tr.nodes(attached)
    tr.forceUpdate()
    tr.getLayer()?.batchDraw()
  }, [project, selectionIds, panMode])

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

  function onStageMouseDown(event: Konva.KonvaEventObject<MouseEvent>) {
    const { button, shiftKey } = event.evt
    if (button === 1 || (button === 0 && panMode)) {
      startPan(event.evt)
      return
    }
    // Clicking empty space clears the selection.
    if (button === 0 && event.target === event.target.getStage() && !shiftKey) {
      editorActions.clearSelection()
    }
  }

  function onStageMouseMove(event: Konva.KonvaEventObject<MouseEvent>) {
    const pointer = event.target.getStage()?.getPointerPosition()
    if (pointer) {
      useUiStore.getState().setCursor(screenToWorld(pointer, useUiStore.getState().viewport))
    }
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

  const cursor = panning ? 'grabbing' : panMode ? 'grab' : hovered ? 'move' : 'default'
  const isEmpty =
    !!project &&
    project.plot.outline.length === 0 &&
    project.objects.length === 0 &&
    project.plantings.length === 0
  const barLength = scaleBarLength(viewport.scale)

  return (
    <div
      ref={containerRef}
      className={styles.canvas}
      style={{ cursor }}
      role="region"
      aria-label={t('editor.canvas.label')}
      data-testid="garden-canvas"
    >
      {size && project && (
        <Stage
          width={size.width}
          height={size.height}
          onMouseDown={onStageMouseDown}
          onMouseMove={onStageMouseMove}
          onMouseLeave={() => useUiStore.getState().setCursor(null)}
          onWheel={onWheel}
          onContextMenu={(e) => e.evt.preventDefault()}
        >
          <Layer listening={false}>
            <Grid viewport={viewport} size={size} />
          </Layer>
          <Layer>
            <Group x={viewport.x} y={viewport.y} scaleX={viewport.scale} scaleY={viewport.scale}>
              <PlotOutline outline={project.plot.outline} />
              <Items
                project={project}
                selection={selection}
                interactive={!panMode}
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
        </Stage>
      )}

      {isEmpty && <p className={styles.emptyHint}>{t('editor.canvas.emptyHint')}</p>}

      <div
        className={styles.scaleBar}
        role="img"
        aria-label={t('editor.canvas.scaleBar', { length: formatRoundLength(barLength) })}
      >
        <span className={styles.scaleBarLine} style={{ width: barLength * viewport.scale }} />
        <span>{formatRoundLength(barLength)}</span>
      </div>
    </div>
  )
}
