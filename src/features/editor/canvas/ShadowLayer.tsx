import { useMemo } from 'react'
import { Group, Layer, Path } from 'react-konva'
import { toSvgPath } from '../../../geometry/shadows'
import { isSunUp } from '../../../geometry/sun'
import type { Viewport } from '../../../geometry/viewport'
import type { GrowthView } from '../../../model/growth'
import { isLayerVisible } from '../../../model/edit'
import type { Project } from '../../../model/schema'
import { SHADOW_STYLE } from '../../../styles/elementStyles'
import { designShadow, useSunPosition } from '../view/sunView'

type Props = { project: Project; viewport: Viewport; year: GrowthView }

/** The merged shadow of all casters at the view bar's sun moment, over the items. */
export function ShadowLayer({ project, viewport, year }: Props) {
  const sun = useSunPosition(project)
  const visible = isLayerVisible(project, 'shadows')
  const data = useMemo(
    () => (sun && visible && isSunUp(sun) ? toSvgPath(designShadow(project, year, sun)) : ''),
    [project, year, sun, visible],
  )
  if (!data) return null
  return (
    <Layer listening={false}>
      <Group x={viewport.x} y={viewport.y} scaleX={viewport.scale} scaleY={viewport.scale}>
        <Path data={data} fill={SHADOW_STYLE.color} opacity={SHADOW_STYLE.opacity} />
      </Group>
    </Layer>
  )
}
