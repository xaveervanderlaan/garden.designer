/**
 * A deep copy with every generated id (any string under an `id` key) replaced by "#1", "#2", … in
 * order of first appearance, also where it is referenced (bedId, mayChange, …). For comparing
 * results that are equal apart from the ids `newId` gave them.
 */
export function withoutIds<T>(value: T): T {
  const ids = new Map<string, string>()
  const json = JSON.stringify(value, (key, v: unknown) => {
    if (key === 'id' && typeof v === 'string' && !ids.has(v)) ids.set(v, `#${ids.size + 1}`)
    return v
  })
  return JSON.parse(json, (_key, v: unknown) =>
    typeof v === 'string' && ids.has(v) ? ids.get(v) : v,
  ) as T
}
