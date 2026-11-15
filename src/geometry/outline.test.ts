import { describe, expect, it } from 'vitest'
import { insertCorner, moveCorner, removeCorner, setEdgeLength } from './outline'

const square = [
  { x: 0, y: 0 },
  { x: 2, y: 0 },
  { x: 2, y: 2 },
  { x: 0, y: 2 },
]

describe('outline editing', () => {
  it('moves, inserts and removes corners', () => {
    expect(moveCorner(square, 1, { x: 3, y: 0 })[1]).toEqual({ x: 3, y: 0 })
    const inserted = insertCorner(square, 3, { x: 0, y: 1 })
    expect(inserted).toHaveLength(5)
    expect(inserted[4]).toEqual({ x: 0, y: 1 })
    expect(removeCorner(inserted, 4)).toEqual(square)
  })

  it('refuses to go below three corners', () => {
    const triangle = square.slice(0, 3)
    expect(removeCorner(triangle, 0)).toBe(triangle)
  })

  it('sets an edge length by moving the next corner along the edge', () => {
    expect(setEdgeLength(square, 0, 5)[1]).toEqual({ x: 5, y: 0 })
    expect(setEdgeLength(square, 3, 1)[0]).toEqual({ x: 0, y: 1 })
    expect(setEdgeLength(square, 0, 0)).toBe(square)
  })
})
