/** "Nice" lengths in metres for grid spacing and the scale bar (1-2-5 series). */
export const NICE_LENGTHS = [
  0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000,
] as const

/** Minor grid lines are never closer together than this (px); major lines at least this far. */
export const MIN_MINOR_SPACING_PX = 10
export const MIN_MAJOR_SPACING_PX = 60

const isMultiple = (a: number, b: number) => Math.abs(a / b - Math.round(a / b)) < 1e-9

/** Grid spacing in metres for a zoom level, e.g. minor 1 m / major 5 m. */
export function gridSteps(scale: number): { minor: number; major: number } {
  const minor =
    NICE_LENGTHS.find((step) => step * scale >= MIN_MINOR_SPACING_PX) ?? NICE_LENGTHS.at(-1)!
  const major =
    NICE_LENGTHS.find(
      (step) => step > minor && step * scale >= MIN_MAJOR_SPACING_PX && isMultiple(step, minor),
    ) ?? minor * 10
  return { minor, major }
}

/** Positions of grid lines between min and max (inclusive), at most `limit` of them. */
export function gridLinePositions(min: number, max: number, step: number, limit = 5000): number[] {
  const positions: number[] = []
  const first = Math.ceil(min / step)
  const last = Math.floor(max / step)
  for (let i = first; i <= last && positions.length < limit; i++) positions.push(i * step)
  return positions
}

/** A nice scale-bar length whose on-screen length is close to (and at most) `maxPx`. */
export function scaleBarLength(scale: number, maxPx = 120): number {
  let best: number = NICE_LENGTHS[0]
  for (const length of NICE_LENGTHS) {
    if (length * scale <= maxPx) best = length
  }
  return best
}
