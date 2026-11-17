import polygonClipping, { type MultiPolygon, type Polygon } from 'polygon-clipping'
import type { Point } from '../model/schema'
import { boundsOfPoints, type Bounds } from './bounds'
import { multiPolygonArea } from './shadows'

const ring = (points: readonly Point[]): Polygon => [
  points.map((p): [number, number] => [p.x, p.y]),
]

const overlaps = (a: Bounds, b: Bounds) =>
  a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY

/**
 * Area in m² of `subject` minus all `clips` (each polygon counted once, however much they
 * overlap). Clips whose bounding box doesn't touch the subject are skipped. If polygon-clipping
 * throws on nearly coincident edges, the clips are subtracted one by one and one that still
 * throws is ignored.
 */
export function differenceArea(
  subject: readonly Point[],
  clips: readonly (readonly Point[])[],
): number {
  const box = boundsOfPoints(subject)
  if (!box) return 0
  const near = clips.filter((c) => {
    const b = boundsOfPoints(c)
    return b !== null && c.length >= 3 && overlaps(box, b)
  })
  const start: MultiPolygon = [ring(subject)]
  if (near.length === 0) return multiPolygonArea(start)
  try {
    return multiPolygonArea(
      polygonClipping.difference(ring(subject), ...near.map((c) => ring(c))) as MultiPolygon,
    )
  } catch {
    let rest = start
    for (const clip of near) {
      try {
        rest = polygonClipping.difference(rest, ring(clip)) as MultiPolygon
      } catch {
        // skip a clip that still fails
      }
    }
    return multiPolygonArea(rest)
  }
}
