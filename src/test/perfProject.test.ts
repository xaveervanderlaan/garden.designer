import { describe, expect, it } from 'vitest'
import { BUILT_IN_PLANTS } from '../data/plants'
import { pointInPolygon, polygonArea } from '../geometry/polygon'
import { relinkBeds } from '../model/beds'
import { newProject } from '../model/defaults'
import { projectSchema } from '../model/schema'
import { buildGardenFile, parseGardenFile } from '../persistence/gardenFile'
import { PERF_PLOT, perfProject } from './perfProject'

describe('perfProject (the performance test design)', () => {
  const project = perfProject(BUILT_IN_PLANTS)

  it('is a valid design of about 1000 m² with exactly 1000 plantings', () => {
    expect(projectSchema.parse(project)).toEqual(project)
    // Built without the app's helpers (see perfProject.ts), but just like a new design.
    const blank = newProject('x')
    expect(project.settings).toEqual(blank.settings)
    expect(project.layers).toEqual(blank.layers)
    expect(project.plantings).toHaveLength(1000)
    expect(polygonArea(project.plot.outline)).toBeCloseTo(1030)
    expect(new Set(project.plantings.map((p) => p.id)).size).toBe(1000)
  })

  it('has many species, beds of both kinds and plants inside the plot', () => {
    expect(new Set(project.plantings.map((p) => p.plantId)).size).toBeGreaterThanOrEqual(30)
    expect(project.objects.filter((o) => o.kind === 'bed-ornamental')).toHaveLength(4)
    expect(project.objects.filter((o) => o.kind === 'bed-vegetable')).toHaveLength(4)
    for (const planting of project.plantings) {
      expect(pointInPolygon(planting.position, PERF_PLOT)).toBe(true)
    }
    // Most plants are in a bed, and the links match the geometry.
    expect(project.plantings.filter((p) => p.bedId).length).toBeGreaterThan(700)
    expect(relinkBeds(project)).toBe(project)
  })

  it('is the same every time for a seed, and takes another count', () => {
    expect(perfProject(BUILT_IN_PLANTS)).toEqual(project)
    expect(perfProject(BUILT_IN_PLANTS, { seed: 2 })).not.toEqual(project)
    expect(perfProject(BUILT_IN_PLANTS, { plantings: 300 }).plantings).toHaveLength(300)
  })

  it('round-trips through a .garden.json file', () => {
    const file = JSON.stringify(buildGardenFile(project, []))
    expect(parseGardenFile(file).project).toEqual(project)
  })
})
