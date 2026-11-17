import { findPlant } from '../../../model/plants'
import type { LegendEntry } from '../../../model/legend'
import type { Project } from '../../../model/schema'
import { PLOT_STYLE } from '../../../styles/elementStyles'
import { PlantSymbol } from '../../library/parts'
import { ObjectSwatch } from '../objects/ObjectSwatch'

const ExistingSwatch = () => (
  <svg width={28} height={20} viewBox="0 0 28 20" aria-hidden>
    <rect
      x={2}
      y={3}
      width={24}
      height={14}
      fill="rgba(120,120,120,0.25)"
      stroke="#777"
      strokeWidth={1.25}
      strokeDasharray="3 2"
    />
  </svg>
)

const PlotSwatch = () => (
  <svg width={28} height={20} viewBox="0 0 28 20" aria-hidden>
    <rect
      x={2}
      y={3}
      width={24}
      height={14}
      fill={PLOT_STYLE.fill}
      stroke={PLOT_STYLE.stroke}
      strokeWidth={2}
    />
  </svg>
)

/** The entry's swatch, as used in the legend panel and (drawn to PNG) in the PDF. */
export function LegendSwatch({ project, entry }: { project: Project; entry: LegendEntry }) {
  if (entry.type === 'plot') return <PlotSwatch />
  if (entry.type === 'existing') return <ExistingSwatch />
  if (entry.type === 'plant') {
    const plant = findPlant(project, entry.plantId)
    return plant ? <PlantSymbol plant={plant} size={20} /> : null
  }
  return <ObjectSwatch kind={entry.kind} material={entry.material} variant={entry.variant} />
}
