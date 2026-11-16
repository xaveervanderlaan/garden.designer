import { describe, expect, it } from 'vitest'
import { frameBox, quarterTurnAngle, rectangleFromCorners, shapeFrameBox } from './frame'
import { rotation, applyMatrix } from './transform'

describe('frame', () => {
  it('keeps angles within a quarter turn', () => {
    expect(quarterTurnAngle(0)).toBe(0)
    expect(quarterTurnAngle(30)).toBe(30)
    expect(quarterTurnAngle(60)).toBe(-30)
    expect(quarterTurnAngle(90)).toBe(0)
    expect(quarterTurnAngle(-100)).toBeCloseTo(-10)
    expect(quarterTurnAngle(45)).toBe(45)
  })

  it('finds the frame of a rotated rectangle', () => {
    const turn = rotation(20, { x: 5, y: 2 })
    const points = rectangleFromCorners({ x: 0, y: 0 }, { x: 10, y: 4 }).map((p) =>
      applyMatrix(turn, p),
    )
    const box = shapeFrameBox({ type: 'polygon', points })
    expect(box.angleDeg).toBeCloseTo(20)
    expect(box.width).toBeCloseTo(10)
    expect(box.depth).toBeCloseTo(4)
    expect(box.centre.x).toBeCloseTo(5)
    expect(box.centre.y).toBeCloseTo(2)
    expect(frameBox(points, 0).width).toBeGreaterThan(10)
  })

  it('builds a rectangle from two corners', () => {
    expect(rectangleFromCorners({ x: 4, y: 3 }, { x: 1, y: 1 })).toEqual([
      { x: 1, y: 1 },
      { x: 4, y: 1 },
      { x: 4, y: 3 },
      { x: 1, y: 3 },
    ])
  })
})
