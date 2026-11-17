import type Konva from 'konva'
import { useEffect, useRef, useState } from 'react'
import { Group, Image as KonvaImage, Layer, Transformer } from 'react-konva'
import { normaliseDegrees } from '../../../geometry/transform'
import type { Viewport } from '../../../geometry/viewport'
import { BACKGROUND_ID, placeBackground } from '../../../model/background'
import type { Background } from '../../../model/schema'
import { loadAssetImage } from './assetImage'
import { useProjectStore } from '../../../store/projectStore'
import { useUiStore } from '../../../store/uiStore'
import { SELECTION_COLOR } from '../../../styles/elementStyles'

/** Right angles catch the rotate handle within this many degrees; anything else is free. */
const ROTATION_SNAPS = [0, 90, 180, 270]

/** Loads an image from the assets table. Null while loading, or if it can't be found. */
function useAssetImage(assetId: string): HTMLImageElement | null {
  const [loaded, setLoaded] = useState<{ assetId: string; image: HTMLImageElement } | null>(null)

  useEffect(() => {
    let cancelled = false
    void loadAssetImage(assetId).then((image) => {
      if (!cancelled && image) setLoaded({ assetId, image })
    })
    return () => {
      cancelled = true
    }
  }, [assetId])

  return loaded?.assetId === assetId ? loaded.image : null
}

/** The site plan image, placed in world coordinates (not interactive). */
export function SitePlanImage({
  background,
  image,
}: {
  background: Background
  image: HTMLImageElement
}) {
  return (
    <KonvaImage
      image={image}
      x={background.offset.x}
      y={background.offset.y}
      rotation={background.rotationDeg}
      scaleX={background.metresPerPixel}
      scaleY={background.metresPerPixel}
      width={background.widthPx}
      height={background.heightPx}
      opacity={background.opacity}
      listening={false}
    />
  )
}

type Props = {
  background: Background
  viewport: Viewport
  /** Can be clicked, dragged and turned (select tool, layer visible and unlocked). */
  selectable: boolean
  selected: boolean
  onHover: (on: boolean) => void
}

/**
 * The site plan, below everything else, in its own layer (it is big, so it isn't redrawn while
 * items change). When selected it can be dragged and turned with a handle; its scale only changes
 * by calibrating.
 */
export function SitePlanLayer({ background, viewport, selectable, selected, onHover }: Props) {
  const image = useAssetImage(background.assetId)
  const node = useRef<Konva.Image>(null)
  const transformer = useRef<Konva.Transformer>(null)
  const editing = selectable && selected

  useEffect(() => {
    const tr = transformer.current
    if (!tr) return
    tr.nodes(editing && image && node.current ? [node.current] : [])
    tr.getLayer()?.batchDraw()
  }, [editing, image])

  /** Stores where the image was dragged or turned to (one undo step). */
  function commit() {
    const current = node.current
    if (!current) return
    const offset = current.position()
    const rotation = normaliseDegrees(current.rotation())
    const { x, y } = background.offset
    if (offset.x === x && offset.y === y && rotation === background.rotationDeg) return
    useProjectStore.getState().update((p) => placeBackground(p, offset, rotation))
  }

  return (
    <Layer listening={selectable}>
      <Group x={viewport.x} y={viewport.y} scaleX={viewport.scale} scaleY={viewport.scale}>
        {image && (
          <KonvaImage
            ref={node}
            image={image}
            x={background.offset.x}
            y={background.offset.y}
            rotation={background.rotationDeg}
            scaleX={background.metresPerPixel}
            scaleY={background.metresPerPixel}
            width={background.widthPx}
            height={background.heightPx}
            opacity={background.opacity}
            draggable={selectable}
            dragDistance={3}
            onMouseDown={(event) => {
              // The site plan is only ever selected on its own.
              if (event.evt.button === 0 && !event.evt.shiftKey) {
                useUiStore.getState().setSelection([BACKGROUND_ID])
              }
            }}
            onDragStart={(event) => {
              if (!useUiStore.getState().selection.includes(BACKGROUND_ID)) event.target.stopDrag()
            }}
            onDragEnd={commit}
            onTransformEnd={commit}
            onMouseEnter={() => onHover(true)}
            onMouseLeave={() => onHover(false)}
          />
        )}
      </Group>
      <Transformer
        ref={transformer}
        resizeEnabled={false}
        rotationSnaps={ROTATION_SNAPS}
        rotationSnapTolerance={2}
        rotateAnchorOffset={28}
        anchorSize={11}
        anchorStroke={SELECTION_COLOR}
        borderStroke={SELECTION_COLOR}
        borderDash={[4, 3]}
      />
    </Layer>
  )
}
