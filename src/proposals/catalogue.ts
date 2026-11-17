import { allPlants, plantName } from '../model/plants'
import type { Brief, Plant, Project } from '../model/schema'

/** The plants offered to Claude: built-in and custom, minus avoided (and toxic) ones, by id. */
export function promptPlants(project: Pick<Project, 'customPlants'>, brief: Brief): Plant[] {
  const avoid = new Set(brief.avoidPlants)
  return allPlants(project)
    .filter((p) => !avoid.has(p.id) && !(brief.avoidToxic && p.toxic))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

const SUN_CODES = { 'full-sun': 'full', 'part-shade': 'part', shade: 'shade' } as const

/** A number with at most 2 decimals, without trailing zeros. */
export const num = (value: number) => String(Math.round(value * 100) / 100)

/** Months as runs: [3, 4, 5, 9] → "3-5,9"; none → "-". */
export function monthRuns(months: readonly number[]): string {
  const sorted = [...months].sort((a, b) => a - b)
  const runs: string[] = []
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i]!
    while (i + 1 < sorted.length && sorted[i + 1] === sorted[i]! + 1) i++
    runs.push(start === sorted[i] ? String(start) : `${start}-${sorted[i]}`)
  }
  return runs.length ? runs.join(',') : '-'
}

const cell = (text: string) => text.replace(/[|\n]/g, '/').trim() || '-'
const yesNo = (value: boolean) => (value ? 'y' : 'n')
const list = (values: readonly string[]) => (values.length ? values.join(',') : '-')

export const CATALOGUE_HEADER =
  'id | name | latin | category | height×spread m | sun | soil | bloom months | flower colours | evergreen | native | wildlife | toxic'

/** One compact row per plant, after a header row. */
export function catalogueRows(plants: readonly Plant[], language: 'en' | 'nl'): string {
  const rows = plants.map((p) =>
    [
      p.id,
      cell(plantName(p, language)),
      cell(p.names.latin),
      p.category,
      `${num(p.heightM)}×${num(p.spreadM)}`,
      p.sun.map((s) => SUN_CODES[s]).join(','),
      list(p.soil),
      monthRuns(p.bloomMonths),
      list(p.flowerColors),
      yesNo(p.evergreen),
      yesNo(p.nativeNL),
      list(p.wildlife),
      yesNo(p.toxic),
    ].join(' | '),
  )
  return [CATALOGUE_HEADER, ...rows].join('\n')
}
