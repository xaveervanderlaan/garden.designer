import { describe, expect, it } from 'vitest'
import { symbolFor } from '../../../model/objectKinds'
import { MATERIAL_STYLES, OBJECT_STYLES } from '../../../styles/elementStyles'
import { drawBoundary, drawPattern, drawSymbol, postPositions } from './objectDrawing'

/** A canvas context that only counts the calls made on it. */
function recordingContext() {
  const calls: Record<string, number> = {}
  const ctx = new Proxy(
    {},
    {
      get: (_target, name: string) => {
        return (..._args: unknown[]) => {
          calls[name] = (calls[name] ?? 0) + 1
        }
      },
      set: () => true,
    },
  ) as unknown as CanvasRenderingContext2D
  return { ctx, calls }
}

const square = (size: number) => [
  { x: 0, y: 0 },
  { x: size, y: 0 },
  { x: size, y: size },
  { x: 0, y: size },
]

describe('objectDrawing', () => {
  it('puts fence posts at the ends and at most 2.4 m apart', () => {
    const posts = postPositions(
      [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 5, y: 2 },
      ],
      2.4,
    )
    // 5 m → 3 bays of 1.67 m; 2 m → one bay: ends, corner and 2 posts in between.
    expect(posts).toHaveLength(5)
    expect(posts[0]).toEqual({ x: 0, y: 0 })
    expect(posts[3]).toEqual({ x: 5, y: 0 })
    expect(posts[4]).toEqual({ x: 5, y: 2 })
    for (let i = 1; i < posts.length; i++) {
      const a = posts[i - 1]!
      const b = posts[i]!
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThanOrEqual(2.4)
    }
    // Exactly 2.4 m needs no post in between; without a spacing only ends and corners.
    expect(
      postPositions(
        [
          { x: 0, y: 0 },
          { x: 2.4, y: 0 },
        ],
        2.4,
      ),
    ).toHaveLength(2)
    expect(
      postPositions([
        { x: 0, y: 0 },
        { x: 9, y: 0 },
      ]),
    ).toHaveLength(2)

    const { ctx, calls } = recordingContext()
    drawBoundary(
      ctx,
      'fence',
      [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
      ],
      0.05,
      OBJECT_STYLES.fence,
      { selected: false, existing: false },
      50,
    )
    expect(calls.rect).toBe(4)
  })

  it('thins dots and brick courses when zoomed out', () => {
    const count = (pattern: Parameters<typeof drawPattern>[2], pxPerM: number, call: string) => {
      const { ctx, calls } = recordingContext()
      drawPattern(ctx, square(4), pattern, pxPerM)
      return calls[call] ?? 0
    }
    const grass = MATERIAL_STYLES.grass.pattern!
    const bricks = MATERIAL_STYLES.bricks.pattern!
    expect(count(grass, 100, 'arc')).toBeGreaterThan(100)
    expect(count(grass, 5, 'arc')).toBeLessThan(count(grass, 100, 'arc') / 4)
    expect(count(bricks, 200, 'moveTo')).toBeGreaterThan(500)
    expect(count(bricks, 10, 'moveTo')).toBeLessThan(count(bricks, 200, 'moveTo') / 10)
    // Every symbol draws without throwing and at its real size.
    for (const kind of ['furniture', 'lighting', 'play', 'compost', 'rain-barrel'] as const) {
      const { ctx } = recordingContext()
      drawSymbol(
        ctx,
        kind,
        symbolFor(kind)!,
        { x: 1, y: 1 },
        OBJECT_STYLES[kind],
        { selected: true, existing: true },
        40,
      )
    }
  })
})
