import type { Plant } from '../model/schema'

/** Lower case, accents and punctuation → "-" (the rule built-in plant ids follow). */
export function slug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Edit distance (insert, delete, substitute), giving up above `max`. */
export function levenshtein(a: string, b: string, max = Infinity): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      const value = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost)
      current.push(value)
      rowMin = Math.min(rowMin, value)
    }
    if (rowMin > max) return max + 1
    previous = current
  }
  return previous[b.length]!
}

const MAX_DISTANCE = 2

/**
 * The plant id meant by `given`: an exact id; else its slug equals an id or a slugged Latin name
 * (only when that names one plant); else the one plant whose slugged Latin name (or id) is within
 * 2 edits. Null when there is no such plant or the match is ambiguous.
 */
export function resolvePlant(plants: readonly Plant[], given: string): string | null {
  if (plants.some((p) => p.id === given)) return given
  const key = slug(given)
  if (!key) return null
  if (plants.some((p) => p.id === key)) return key
  const byLatin = plants.filter((p) => slug(p.names.latin) === key)
  if (byLatin.length > 0) return byLatin.length === 1 ? byLatin[0]!.id : null
  let best = MAX_DISTANCE + 1
  let found: string[] = []
  for (const plant of plants) {
    const d = Math.min(
      levenshtein(key, slug(plant.names.latin), MAX_DISTANCE),
      levenshtein(key, plant.id, MAX_DISTANCE),
    )
    if (d < best) {
      best = d
      found = [plant.id]
    } else if (d === best && d <= MAX_DISTANCE) found.push(plant.id)
  }
  return best <= MAX_DISTANCE && found.length === 1 ? found[0]! : null
}
