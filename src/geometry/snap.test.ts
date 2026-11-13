import { describe, expect, it } from 'vitest'
import { type SnapContext, edgesOf, snapPoint } from './snap'

/** 10 px/m: the 10 px tolerance is 1 m. Grid 0.5 m. */
const base: SnapContext = { vertices: [], edges: [], gridSize: 0.5, scale: 10 }

describe('snapPoint', () => {
  it('snaps to the grid by default', () => {
    expect(snapPoint({ x: 3.3, y: 7.8 }, base)).toEqual({ point: { x: 3.5, y: 8 }, kind: 'grid' })
  })

  it('prefers an existing corner within the tolerance', () => {
    const ctx = { ...base, vertices: [{ x: 4.1, y: 4.1 }] }
    expect(snapPoint({ x: 4.6, y: 4.5 }, ctx)).toEqual({
      point: { x: 4.1, y: 4.1 },
      kind: 'vertex',
    })
    expect(snapPoint({ x: 6, y: 6 }, ctx).kind).toBe('grid') // too far away
  })

  it('snaps to the nearest point of an edge', () => {
    const ctx = {
      ...base,
      edges: [
        [
          { x: 0, y: 0.3 },
          { x: 10, y: 0.3 },
        ],
      ] as const,
    }
    const snap = snapPoint({ x: 3.33, y: 0.9 }, { ...ctx, edges: [...ctx.edges] })
    expect(snap.kind).toBe('edge')
    expect(snap.point.x).toBeCloseTo(3.33)
    expect(snap.point.y).toBeCloseTo(0.3)
  })

  it('snaps to 15° steps from the previous corner, with the length on the grid', () => {
    const anchor = { x: 0, y: 0 }
    // Nearly straight right (0°), 7.3 m away → exactly 7.5 m to the right.
    const right = snapPoint({ x: 7.3, y: 0.4 }, { ...base, anchor })
    expect(right.kind).toBe('angle')
    expect(right.angle).toBe(0)
    expect(right.point.x).toBeCloseTo(7.5)
    expect(right.point.y).toBeCloseTo(0)

    // Close to 45° (up and to the right).
    const diagonal = snapPoint({ x: 5, y: -5.4 }, { ...base, anchor })
    expect(diagonal.kind).toBe('angle')
    expect(diagonal.angle).toBe(45)
  })

  it('catches right angles from further away than other angles', () => {
    const anchor = { x: 0, y: 0 }
    // 1.4 m off a straight-down line (270°) at 10 m: beyond 1 m, within 1.6 m. The nearest 15° step
    // would be 285°, but the right angle wins.
    const snap = snapPoint({ x: 1.4, y: 10 }, { ...base, anchor })
    expect(snap.kind).toBe('angle')
    expect(snap.angle).toBe(270)
    // 1.9 m off: too far for the right angle; 285° is within 1 m.
    expect(snapPoint({ x: 2.6, y: 10 }, { ...base, anchor }).angle).toBe(285)
  })

  it('prefers a corner over an angle', () => {
    const ctx = { ...base, anchor: { x: 0, y: 0 }, vertices: [{ x: 7.4, y: 0.2 }] }
    expect(snapPoint({ x: 7.3, y: 0.1 }, ctx).kind).toBe('vertex')
  })

  it('can leave out the grid, also for lengths along a snapped angle', () => {
    const off = { ...base, snapToGrid: false }
    expect(snapPoint({ x: 3.3, y: 7.8 }, off)).toEqual({ point: { x: 3.3, y: 7.8 }, kind: null })
    const right = snapPoint({ x: 7.3, y: 0.4 }, { ...off, anchor: { x: 0, y: 0 } })
    expect(right.kind).toBe('angle')
    expect(right.point.x).toBeCloseTo(7.3)
    expect(right.point.y).toBeCloseTo(0)
    // Corners still snap.
    expect(snapPoint({ x: 4.6, y: 4.5 }, { ...off, vertices: [{ x: 4.1, y: 4.1 }] }).kind).toBe(
      'vertex',
    )
  })

  it('uses a tolerance in pixels, so it tightens when zooming in', () => {
    const ctx = { ...base, vertices: [{ x: 5, y: 5 }] }
    expect(snapPoint({ x: 5.5, y: 5 }, ctx).kind).toBe('vertex') // 5 px at 10 px/m
    expect(snapPoint({ x: 5.5, y: 5 }, { ...ctx, scale: 100 }).kind).toBe('grid') // 50 px
  })
})

describe('edgesOf', () => {
  it('lists edges of open and closed shapes', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ]
    expect(edgesOf(pts, false)).toHaveLength(2)
    expect(edgesOf(pts, true)).toHaveLength(3)
    expect(edgesOf(pts, true)[2]).toEqual([pts[2], pts[0]])
  })
})
