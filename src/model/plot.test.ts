import { describe, expect, it } from 'vitest'
import { edgeLengths, polygonArea } from '../geometry/polygon'
import { newProject } from './defaults'
import { isPlotSelected, validSelection } from './edit'
import {
  PLOT_ID,
  cornerLabel,
  hasPlot,
  insertPlotCorner,
  movePlotCorner,
  rectangleOutline,
  removePlotCorner,
  setPlotEdgeLength,
  setPlotOutline,
} from './plot'
import type { Project } from './schema'

function withRectangle(width = 20, depth = 15): Project {
  const project = newProject('Tuin')
  return setPlotOutline(project, rectangleOutline(project, width, depth))
}

describe('cornerLabel', () => {
  it.each([
    [0, 'A'],
    [3, 'D'],
    [25, 'Z'],
    [26, 'AA'],
    [27, 'AB'],
  ])('%i → %s', (index, label) => {
    expect(cornerLabel(index)).toBe(label)
  })
})

describe('plot outline', () => {
  it('creates a rectangle at the origin, or at the current plot', () => {
    const project = withRectangle()
    expect(project.plot.outline).toEqual([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 15 },
      { x: 0, y: 15 },
    ])
    expect(hasPlot(project)).toBe(true)
    expect(hasPlot(newProject('Empty'))).toBe(false)

    const moved = movePlotCorner(project, 0, { x: -5, y: -3 })
    expect(rectangleOutline(moved, 10, 10)[0]).toEqual({ x: -5, y: -3 })
  })

  it('stores clean coordinates', () => {
    const project = setPlotOutline(newProject('T'), [
      { x: 0.1 + 0.2, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ])
    expect(project.plot.outline[0]).toEqual({ x: 0.3, y: 0 })
  })

  it('moves, inserts and removes corners', () => {
    let project = withRectangle()
    project = insertPlotCorner(project, 0, { x: 10, y: -2 }) // a point on edge A→B
    expect(project.plot.outline).toHaveLength(5)
    expect(project.plot.outline[1]).toEqual({ x: 10, y: -2 })

    project = movePlotCorner(project, 1, { x: 10, y: 0 })
    expect(polygonArea(project.plot.outline)).toBe(300)

    project = removePlotCorner(project, 1)
    expect(project.plot.outline).toHaveLength(4)
  })

  it('never goes below 3 corners', () => {
    const triangle = setPlotOutline(newProject('T'), [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 0, y: 3 },
    ])
    expect(removePlotCorner(triangle, 0)).toBe(triangle)
  })

  it('sets an edge length by moving the next corner along the edge', () => {
    const project = setPlotEdgeLength(withRectangle(), 0, 25) // A→B from 20 to 25
    expect(project.plot.outline[1]).toEqual({ x: 25, y: 0 })
    expect(edgeLengths(project.plot.outline)[0]).toBe(25)
    // The last edge D→A wraps around to corner A.
    expect(setPlotEdgeLength(withRectangle(), 3, 10).plot.outline[0]).toEqual({ x: 0, y: 5 })
    // Invalid lengths change nothing.
    const project2 = withRectangle()
    expect(setPlotEdgeLength(project2, 0, 0)).toBe(project2)
  })
})

describe('selecting the plot', () => {
  it('is possible with an outline on an editable layer', () => {
    const project = withRectangle()
    expect(validSelection(project, [PLOT_ID])).toEqual([PLOT_ID])
    expect(isPlotSelected(project, [PLOT_ID])).toBe(true)

    expect(validSelection(newProject('Empty'), [PLOT_ID])).toEqual([])
    const locked = {
      ...project,
      layers: { ...project.layers, existing: { visible: true, locked: true } },
    }
    expect(validSelection(locked, [PLOT_ID])).toEqual([])
  })
})
