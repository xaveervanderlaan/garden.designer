import { describe, expect, it } from 'vitest'
import { NO_SUN_LEVEL } from '../../../geometry/sunHours'
import { newProject } from '../../../model/defaults'
import type { GardenObject, Planting, Project } from '../../../model/schema'
import { levelShares, sunMapInput, sunMapKey, sunMapPixels, type SunMapRequest } from './sunMap'

const request: SunMapRequest = { day: { kind: 'season', year: 2026 }, cellM: 0.5, year: 'mature' }

const fence = (y: number): GardenObject => ({
  id: 'fence',
  kind: 'fence',
  layer: 'hardscape',
  status: 'new',
  heightM: 1.8,
  shape: {
    type: 'polyline',
    points: [
      { x: 0, y },
      { x: 20, y },
    ],
    thicknessM: 0.1,
  },
})

const plantingAt = (x: number): Planting => ({
  id: 'p',
  plantId: 'armeria-maritima',
  position: { x, y: 5 },
  plantedYear: 2026,
})

function design(): Project {
  const p = newProject('Sun map', 0)
  p.plot = {
    outline: [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 10, y: 15 },
    ],
  }
  p.objects = [fence(15)]
  p.plantings = [plantingAt(5)]
  return p
}

describe('sun map input', () => {
  it("covers the plot's bounding box and masks it", () => {
    const input = sunMapInput(design(), request)!
    expect(input.grid).toMatchObject({ originX: 0, originY: 0, cellM: 0.5, cols: 40, rows: 30 })
    expect(input.mask).toHaveLength(3)
    expect(input.days).toEqual(request.day)
    expect(input.casters.length).toBeGreaterThan(0)
  })

  it('returns null without a plot', () => {
    expect(sunMapInput(newProject('Empty', 0), request)).toBeNull()
  })

  it('the key changes when the fence moves, not when a low plant moves', () => {
    const key = (p: Project) => sunMapKey(sunMapInput(p, request)!)
    const base = design()
    expect(key({ ...base, objects: [fence(14)] })).not.toBe(key(base))
    expect(key({ ...base, plantings: [plantingAt(8)] })).toBe(key(base))
  })
})

describe('sun map pixels', () => {
  const levels = Uint8Array.from([0, 1, 2, NO_SUN_LEVEL])

  it('colours each level and leaves masked cells transparent', () => {
    const px = sunMapPixels(levels)
    expect([...px.slice(0, 4)]).toEqual([0xf5, 0xc5, 0x18, 255])
    expect([...px.slice(4, 8)]).toEqual([0x9b, 0x8f, 0xd0, 255])
    expect([...px.slice(8, 12)]).toEqual([0x3f, 0x3d, 0x8f, 255])
    expect(px[15]).toBe(0)
  })

  it('shares count only masked cells', () => {
    expect(levelShares(levels)).toEqual({ 'full-sun': 1 / 3, 'part-shade': 1 / 3, shade: 1 / 3 })
    expect(levelShares(Uint8Array.from([NO_SUN_LEVEL])).shade).toBe(0)
  })
})
