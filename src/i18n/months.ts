import i18n from '.'
import { MONTHS } from '../model/schema'

type Month = (typeof MONTHS)[number]

const isMonth = (m: number): m is Month => Number.isInteger(m) && m >= 1 && m <= 12

/** "Jun" / "jun". */
export function monthShort(month: number): string {
  return isMonth(month) ? i18n.t(`plants.monthShort.${month}`) : ''
}

/** "June" / "juni". */
export function monthLong(month: number): string {
  return isMonth(month) ? i18n.t(`plants.monthLong.${month}`) : ''
}

/**
 * Groups months into runs of consecutive months, continuing over the turn of the year:
 * [1, 2, 3, 11, 12] → [[11, 12, 1, 2, 3]]; [4, 5, 6, 9] → [[4, 5, 6], [9]].
 */
export function monthRuns(months: readonly number[]): number[][] {
  const set = new Set<number>(months.filter(isMonth))
  if (set.size === 0) return []
  if (set.size === 12) return [[...MONTHS]]
  // Start just after a month that isn't in the set, so no run is cut in two.
  const gap = MONTHS.find((m) => !set.has(m))!
  const runs: number[][] = []
  let run: number[] = []
  for (let i = 1; i <= 12; i++) {
    const m = ((gap - 1 + i) % 12) + 1
    if (set.has(m)) run.push(m)
    else if (run.length) {
      runs.push(run)
      run = []
    }
  }
  if (run.length) runs.push(run)
  return runs.sort((a, b) => a[0]! - b[0]!)
}

/** Compact month list in the UI language: "Jun–Aug", "Nov–Mar", "Apr–Jun, Sep". */
export function formatMonths(months: readonly number[]): string {
  return monthRuns(months)
    .map((run) =>
      run.length === 1
        ? monthShort(run[0]!)
        : i18n.t('plants.monthRange', { from: monthShort(run[0]!), to: monthShort(run.at(-1)!) }),
    )
    .join(', ')
}
