import type { FlowerColor, FoliageColor, Plant, PlantCategory, Wildlife } from '../../model/schema'
import { plantName } from '../../model/plants'

/** A category tab: one category, everything, or only the design's own (custom) plants. */
export type LibraryCategory = 'all' | 'custom' | PlantCategory

export type LibraryFilters = {
  query: string
  category: LibraryCategory
  /** Flowers in at least one of these months. */
  bloomMonths: number[]
  /** Has at least one of these flower colours. */
  flowerColors: FlowerColor[]
  /** Has one of these foliage colours. */
  foliageColors: FoliageColor[]
  nativeNL: boolean
  /** Good for all of these. */
  wildlife: Wildlife[]
  nonToxic: boolean
}

export const NO_FILTERS: LibraryFilters = {
  query: '',
  category: 'all',
  bloomMonths: [],
  flowerColors: [],
  foliageColors: [],
  nativeNL: false,
  wildlife: [],
  nonToxic: false,
}

/** Number of filters in use, not counting the search text and the category tab. */
export function activeFilterCount(filters: LibraryFilters): number {
  return (
    (filters.bloomMonths.length ? 1 : 0) +
    (filters.flowerColors.length ? 1 : 0) +
    (filters.foliageColors.length ? 1 : 0) +
    (filters.nativeNL ? 1 : 0) +
    filters.wildlife.length +
    (filters.nonToxic ? 1 : 0)
  )
}

/**
 * Text for matching: lower case, accents removed ("Tête" → "tete"), and anything that isn't a
 * letter or digit turned into single spaces ("vergeet-mij-niet" → "vergeet mij niet").
 */
export function normalise(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

const haystacks = new WeakMap<Plant, string>()

function haystack(plant: Plant): string {
  let text = haystacks.get(plant)
  if (text === undefined) {
    text = normalise(`${plant.names.nl} ${plant.names.en} ${plant.names.latin}`)
    haystacks.set(plant, text)
  }
  return text
}

/** Every word of the query occurs in the Dutch, English or Latin name. */
export function matchesQuery(plant: Plant, query: string): boolean {
  const words = normalise(query).split(' ').filter(Boolean)
  const text = haystack(plant)
  return words.every((word) => text.includes(word))
}

/**
 * Ranking for a search (lower is better): the name in the UI language equal to the query, then
 * starting with it, then any name with a word starting with it, then the rest.
 */
export function searchRank(plant: Plant, query: string, lang: 'en' | 'nl'): number {
  const q = normalise(query)
  const name = normalise(plantName(plant, lang))
  if (name === q) return 0
  if (name.startsWith(q)) return 1
  if (` ${haystack(plant)}`.includes(` ${q}`)) return 2
  return 3
}

export type FilterContext = {
  lang: 'en' | 'nl'
  isCustom: (plant: Plant) => boolean
}

function matchesFilters(plant: Plant, filters: LibraryFilters, ctx: FilterContext): boolean {
  if (filters.category === 'custom') {
    if (!ctx.isCustom(plant)) return false
  } else if (filters.category !== 'all' && plant.category !== filters.category) {
    return false
  }
  if (filters.bloomMonths.length && !plant.bloomMonths.some((m) => filters.bloomMonths.includes(m)))
    return false
  if (
    filters.flowerColors.length &&
    !plant.flowerColors.some((c) => filters.flowerColors.includes(c))
  )
    return false
  if (filters.foliageColors.length && !filters.foliageColors.includes(plant.foliageColor))
    return false
  if (filters.nativeNL && !plant.nativeNL) return false
  if (!filters.wildlife.every((w) => plant.wildlife.includes(w))) return false
  if (filters.nonToxic && plant.toxic) return false
  return true
}

/** The plants that match, sorted by name in the UI language (by relevance when searching). */
export function filterPlants(
  plants: readonly Plant[],
  filters: LibraryFilters,
  ctx: FilterContext,
): Plant[] {
  const query = filters.query.trim()
  const collator = new Intl.Collator(ctx.lang, { sensitivity: 'base', numeric: true })
  const byName = (a: Plant, b: Plant) =>
    collator.compare(plantName(a, ctx.lang), plantName(b, ctx.lang)) ||
    collator.compare(a.names.latin, b.names.latin)

  const found = plants.filter(
    (plant) => (!query || matchesQuery(plant, query)) && matchesFilters(plant, filters, ctx),
  )
  if (!query) return found.sort(byName)

  const rank = new Map(found.map((plant) => [plant, searchRank(plant, query, ctx.lang)]))
  return found.sort((a, b) => rank.get(a)! - rank.get(b)! || byName(a, b))
}
