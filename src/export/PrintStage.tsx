import type Konva from 'konva'
import { useEffect, useRef } from 'react'
import { Group, Layer, Rect, Stage } from 'react-konva'
import type { Size, Viewport } from '../geometry/viewport'
import type { Language } from '../i18n'
import { isLayerVisible } from '../model/edit'
import { PLOT_LAYER } from '../model/plot'
import type { Background, Project } from '../model/schema'
import type { Severity } from '../model/warnings'
import type { LabelMode } from '../store/uiStore'
import type { PlantView } from '../styles/plantAppearance'
import { itemLabels } from '../features/editor/canvas/itemLabels'
import { type ItemHandlers, Items } from '../features/editor/canvas/Items'
import { PlotOverlay, PlotShape } from '../features/editor/canvas/Plot'
import { ShadowLayer } from '../features/editor/canvas/ShadowLayer'
import { SitePlanImage } from '../features/editor/canvas/SitePlan'
import { SunMapLayer } from '../features/editor/canvas/SunMapLayer'

export type RenderPlanOptions = {
  project: Project
  /** Maps the world (metres) onto the stage, in layout pixels. */
  viewport: Viewport
  /** The stage size in layout pixels; the image is `size × pixelRatio`. */
  size: Size
  pixelRatio: number
  view: PlantView
  labelMode: LabelMode
  lang: Language
  /** Draw the sun-hours map and shadows when they are shown (default true). */
  includeSun?: boolean
}

const noop = () => {}
const ORIGIN = { x: 0, y: 0 }
const HANDLERS: ItemHandlers = {
  register: noop,
  offset: () => ORIGIN,
  mouseDown: noop,
  dragStart: noop,
  dragMove: noop,
  dragEnd: noop,
  hover: noop,
}
const NO_SELECTION: ReadonlySet<string> = new Set()
const NO_WARNINGS: ReadonlyMap<string, Severity> = new Map()
const NOT_HELD = { current: false }

export type PrintStageProps = RenderPlanOptions & {
  background: Background | null
  image: HTMLImageElement | null
  onReady: (stage: Konva.Stage) => void
}

/** The plan as the editor draws it, without grid, selection, handles or warning badges. */
export function PrintStage({
  project,
  viewport,
  size,
  view,
  labelMode,
  lang,
  includeSun = true,
  background,
  image,
  onReady,
}: PrintStageProps) {
  const stage = useRef<Konva.Stage>(null)
  useEffect(() => {
    if (stage.current) onReady(stage.current)
  }, [onReady])

  const { labels, planLabels } = itemLabels(project, labelMode, lang)
  const outline = project.plot.outline
  const plotVisible = isLayerVisible(project, PLOT_LAYER)
  const world = { x: viewport.x, y: viewport.y, scaleX: viewport.scale, scaleY: viewport.scale }
  return (
    <Stage ref={stage} width={size.width} height={size.height} listening={false}>
      <Layer listening={false}>
        <Rect width={size.width} height={size.height} fill="#ffffff" />
        {background && image && (
          <Group {...world}>
            <SitePlanImage background={background} image={image} />
          </Group>
        )}
      </Layer>
      <Layer listening={false}>
        <Group {...world}>
          {plotVisible && (
            <PlotShape
              outline={outline}
              selectable={false}
              selected={false}
              warning={false}
              onMouseDown={noop}
              onHover={noop}
            />
          )}
          <Items
            project={project}
            selection={NO_SELECTION}
            interactive={false}
            handlers={HANDLERS}
            warned={NO_WARNINGS}
            labels={labels}
            labelMode={labelMode}
            planLabels={planLabels}
            objectDraft={null}
            view={view}
          />
        </Group>
      </Layer>
      {includeSun && <SunMapLayer project={project} viewport={viewport} />}
      {includeSun && <ShadowLayer project={project} viewport={viewport} year={view.year} />}
      {plotVisible && (
        <Layer listening={false}>
          <PlotOverlay
            project={project}
            outline={outline}
            viewport={viewport}
            showLabels={isLayerVisible(project, 'measurements')}
            editing={false}
            altHeld={NOT_HELD}
            onDraft={noop}
          />
        </Layer>
      )}
    </Stage>
  )
}
