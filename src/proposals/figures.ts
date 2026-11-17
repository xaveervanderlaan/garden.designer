import { areaTotals } from '../model/areas'
import { bloomChart } from '../model/bloomChart'
import { findPlant } from '../model/plants'
import type { Project } from '../model/schema'
import { plantingWarnings, warningSeverity } from '../model/warnings'

/** Key figures of a whole design (the base design plus a proposal), for comparing proposals. */
export type ProposalFigures = {
  pavedM2: number
  lawnM2: number
  plantedM2: number
  /** Plantings of a known plant. */
  plants: number
  /** Distinct plants among them. */
  species: number
  /** Share (0–1) of the plantings that are native; null without plantings. */
  nativeShare: number | null
  evergreenShare: number | null
  /** Months with something in bloom. */
  bloomMonths: number
  /** Planting warnings at mature size (notices are not counted). */
  warnings: number
}

export function proposalFigures(project: Project): ProposalFigures {
  const totals = areaTotals(project)
  const group = (name: string) => totals.groups.find((g) => g.group === name)?.totalM2 ?? 0
  const lawnM2 = totals.groups
    .flatMap((g) => g.rows)
    .filter((r) => r.kind === 'lawn')
    .reduce((sum, r) => sum + r.areaM2, 0)
  const known = project.plantings.flatMap((p) => {
    const plant = findPlant(project, p.plantId)
    return plant ? [plant] : []
  })
  const share = (test: (plant: (typeof known)[number]) => boolean) =>
    known.length === 0 ? null : known.filter(test).length / known.length
  const warnings = plantingWarnings(project, { view: 'mature' }).filter(
    (w) => warningSeverity(w) === 'warning',
  ).length
  return {
    pavedM2: group('paved'),
    lawnM2,
    plantedM2: group('beds'),
    plants: known.length,
    species: new Set(known.map((p) => p.id)).size,
    nativeShare: share((p) => p.nativeNL),
    evergreenShare: share((p) => p.evergreen),
    bloomMonths: 12 - bloomChart(project, { lang: 'en' }).emptyMonths.length,
    warnings,
  }
}

/** The figures a gallery can sort by. */
export const FIGURE_KEYS = [
  'paved',
  'lawn',
  'planted',
  'plants',
  'species',
  'native',
  'bloom',
  'evergreen',
  'warnings',
] as const
export type FigureKey = (typeof FIGURE_KEYS)[number]

function figureValue(figures: ProposalFigures, key: FigureKey): number | null {
  switch (key) {
    case 'paved':
      return figures.pavedM2
    case 'lawn':
      return figures.lawnM2
    case 'planted':
      return figures.plantedM2
    case 'plants':
      return figures.plants
    case 'species':
      return figures.species
    case 'native':
      return figures.nativeShare
    case 'bloom':
      return figures.bloomMonths
    case 'evergreen':
      return figures.evergreenShare
    case 'warnings':
      return figures.warnings
  }
}

/**
 * Comparator for a figure: most first (fewest warnings first), missing values last, ties 0 (so a
 * stable sort keeps the received order).
 */
export function compareByFigure(
  key: FigureKey,
): (a: ProposalFigures, b: ProposalFigures) => number {
  const sign = key === 'warnings' ? 1 : -1
  return (a, b) => {
    const x = figureValue(a, key)
    const y = figureValue(b, key)
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1
    return sign * (x - y)
  }
}
