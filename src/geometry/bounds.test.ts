import { describe, expect, it } from 'vitest'
import { newProject } from '../model/defaults'
import { sampleProjectWithAsset } from '../test/fixtures'
import {
  POINT_OBJECT_RADIUS_M,
  boundsCentre,
  boundsOfPoints,
  projectBounds,
  shapeBounds,
  unionBounds,
} from './bounds'

describe('bounds', () => {
  it('of points', () => {
    expect(boundsOfPoints([])).toBeNull()
    expect(
      boundsOfPoints([
        { x: 1, y: 5 },
        { x: -2, y: 3 },
      ]),
    ).toEqual({ minX: -2, minY: 3, maxX: 1, maxY: 5 })
  })

  it('of shapes, including line thickness and point size', () => {
    expect(
      shapeBounds({
        type: 'polyline',
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
        thicknessM: 0.2,
      }),
    ).toEqual({ minX: -0.1, minY: -0.1, maxX: 10.1, maxY: 0.1 })
    const r = POINT_OBJECT_RADIUS_M
    expect(shapeBounds({ type: 'point', position: { x: 1, y: 1 }, rotationDeg: 0 })).toEqual({
      minX: 1 - r,
      minY: 1 - r,
      maxX: 1 + r,
      maxY: 1 + r,
    })
  })

  it('unions and centres', () => {
    const a = { minX: 0, minY: 0, maxX: 2, maxY: 2 }
    const b = { minX: 1, minY: -1, maxX: 5, maxY: 1 }
    expect(unionBounds(a, null)).toBe(a)
    expect(unionBounds(a, b)).toEqual({ minX: 0, minY: -1, maxX: 5, maxY: 2 })
    expect(boundsCentre(b)).toEqual({ x: 3, y: 0 })
  })

  it('of a whole project', () => {
    expect(projectBounds(newProject('Empty'))).toBeNull()
    // Plot 20 × 15 m plus a lavender (0.6 m spread) at (2, 2), all inside the plot.
    expect(projectBounds(sampleProjectWithAsset().project)).toEqual({
      minX: 0,
      minY: 0,
      maxX: 20,
      maxY: 15,
    })
  })
})
