import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PrintStage } from '../../export/PrintStage'
import { designBounds } from '../../export/exportOptions'
import { type Viewport, fitBounds, screenToWorld } from '../../geometry/viewport'
import { currentLanguage } from '../../i18n'
import { isLayerVisible } from '../../model/edit'
import type { Point, Project } from '../../model/schema'
import type { PlantView } from '../../styles/plantAppearance'
import { loadAssetImage } from '../editor/canvas/assetImage'
import { useElementSize } from '../editor/canvas/useElementSize'
import { useViewerGestures } from './useViewerGestures'
import styles from './viewer.module.css'

type Props = {
  project: Project
  view: PlantView
  selection: ReadonlySet<string>
  /** Increases to ask for a fit to the design. */
  fitRequest: number
  onTap(world: Point, scale: number): void
}

/**
 * The plan in the viewer: the print drawing (no hit graph) in a container that pans and zooms
 * with touch, mouse and wheel, and reports taps in world metres.
 */
export function ViewerPlan({ project, view, selection, fitRequest, onTap }: Props) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const size = useElementSize(ref)
  const [viewport, setViewport] = useState<Viewport | null>(null)
  const [fitted, setFitted] = useState(true)
  const [handledFit, setHandledFit] = useState(fitRequest)

  // Fit on the first size and on request; while still fitted, a size change (rotation) re-fits.
  const fitNeeded = handledFit !== fitRequest
  useEffect(() => {
    if (!size || size.width === 0 || size.height === 0) return
    if (fitNeeded || fitted || !viewport) {
      setViewport(fitBounds(designBounds(project), size))
      setFitted(true)
      setHandledFit(fitRequest)
    }
    // Only the size and a fit request move the viewport.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, fitRequest])

  // Gestures run between renders: they read and write the latest viewport through a ref.
  const current = useRef(viewport)
  useEffect(() => {
    current.current = viewport
  }, [viewport])
  useViewerGestures(ref, {
    viewport: () => current.current ?? { x: 0, y: 0, scale: 1 },
    setViewport: (vp) => {
      if (!current.current) return
      current.current = vp
      setViewport(vp)
    },
    onGestureStart: () => setFitted(false),
    onTap: (at) => {
      const vp = current.current
      if (vp) onTap(screenToWorld(at, vp), vp.scale)
    },
  })

  const background = project.background ?? null
  const showSitePlan = background !== null && isLayerVisible(project, 'background')
  const assetId = showSitePlan ? background.assetId : null
  const [image, setImage] = useState<{ assetId: string; image: HTMLImageElement } | null>(null)
  useEffect(() => {
    if (!assetId) return
    let cancelled = false
    void loadAssetImage(assetId).then((loaded) => {
      if (!cancelled && loaded) setImage({ assetId, image: loaded })
    })
    return () => {
      cancelled = true
    }
  }, [assetId])

  return (
    <div
      ref={ref}
      className={styles.plan}
      role="region"
      aria-label={t('viewer.plan')}
      data-testid="plan-area"
    >
      {size && viewport && size.width > 0 && size.height > 0 && (
        <PrintStage
          project={project}
          viewport={viewport}
          size={size}
          pixelRatio={1}
          view={view}
          labelMode="name"
          lang={currentLanguage()}
          includeSun={false}
          background={showSitePlan ? background : null}
          image={image && image.assetId === assetId ? image.image : null}
          selection={selection}
        />
      )}
    </div>
  )
}
