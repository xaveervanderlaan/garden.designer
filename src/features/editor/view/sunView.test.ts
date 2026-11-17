import { describe, expect, it } from 'vitest'
import { builtInPlant } from '../../../data/plants'
import { sunPositionAt } from '../../../geometry/sun'
import { newProject } from '../../../model/defaults'
import type { GardenObject, Planting, Project } from '../../../model/schema'
import {
  clampMoment,
  defaultSunMoment,
  designShadow,
  formatClock,
  northAngleFromPointer,
  sunRange,
} from './sunView'

const NL = { lat: 52.13, lng: 5.29 }
const DEC = { year: 2026, month: 12, day: 21 }
const JUN = { year: 2026, month: 6, day: 21 }

const fence: GardenObject = {
  id: 'fence',
  kind: 'fence',
  layer: 'hardscape',
  status: 'new',
  heightM: 1.8,
  shape: {
    type: 'polyline',
    points: [
      { x: 0, y: 15 },
      { x: 20, y: 15 },
    ],
    thicknessM: 0.1,
  },
}

function design(): Project {
  const p = newProject('Sun', 0)
  p.objects = [fence]
  return p
}

const ys = (shape: ReturnType<typeof designShadow>) => shape.flat(2).map(([, y]) => y!)

describe('sunView', () => {
  it('sunRange runs from sunrise to sunset in 5-minute steps', () => {
    const r = sunRange(DEC, NL)
    expect(r.min % 5).toBe(0)
    expect(r.max % 5).toBe(0)
    expect(r.min).toBeGreaterThan(8 * 60)
    expect(r.min).toBeLessThan(9 * 60)
    expect(r.max).toBeGreaterThan(16 * 60)
    expect(r.max).toBeLessThan(17 * 60)
    expect(r.noon).toBeGreaterThan(r.min)
    expect(r.noon).toBeLessThan(r.max)
    const summer = sunRange(JUN, NL)
    expect(summer.max - summer.min).toBeGreaterThan(15 * 60)
  })

  it('defaultSunMoment uses now while the sun is up, else solar noon', () => {
    const noon = Date.UTC(2026, 5, 21, 10, 0) // 12:00 in Amsterdam
    expect(defaultSunMoment(NL, noon)).toEqual({ date: JUN, minutes: 720 })
    const night = Date.UTC(2026, 5, 21, 0, 30) // 02:30 local
    const m = defaultSunMoment(NL, night)
    expect(m.date).toEqual(JUN)
    expect(m.minutes).toBeGreaterThan(12 * 60)
    expect(m.minutes).toBeLessThan(14 * 60)
  })

  it('clampMoment keeps the time inside a shorter day', () => {
    const r = sunRange(DEC, NL)
    expect(clampMoment({ date: DEC, minutes: 20 * 60 }, NL).minutes).toBe(r.max)
    expect(clampMoment({ date: DEC, minutes: 5 * 60 }, NL).minutes).toBe(r.min)
    expect(clampMoment({ date: DEC, minutes: 750 }, NL).minutes).toBe(750)
  })

  it('formatClock pads hours and minutes', () => {
    expect(formatClock(8 * 60 + 5)).toBe('08:05')
    expect(formatClock(0)).toBe('00:00')
    expect(formatClock(16 * 60 + 40)).toBe('16:40')
  })

  it('northAngleFromPointer is clockwise from up and snaps to 15°', () => {
    const c = { x: 100, y: 100 }
    expect(northAngleFromPointer(c, { x: 100, y: 50 })).toBe(0)
    expect(northAngleFromPointer(c, { x: 150, y: 100 })).toBe(90)
    expect(northAngleFromPointer(c, { x: 100, y: 150 })).toBe(180)
    expect(northAngleFromPointer(c, { x: 50, y: 100 })).toBe(270)
    expect(northAngleFromPointer(c, { x: 150, y: 50 }, true)).toBe(45)
    expect(northAngleFromPointer(c, { x: 130, y: 50 }, true)).toBe(30)
  })

  it("designShadow: a 1.8 m fence's shadow reaches ~6.9 m north at noon on 21 December and turns with the north angle", () => {
    const noon = sunRange(DEC, NL).noon
    const sun = sunPositionAt(DEC, noon, NL)
    const north = designShadow(design(), 'mature', sun)
    // Fence at y = 15, north is up: the shadow reaches up to y ≈ 8.1.
    expect(Math.min(...ys(north))).toBeGreaterThan(7.5)
    expect(Math.min(...ys(north))).toBeLessThan(8.7)
    const turned = design()
    turned.settings.northAngleDeg = 180
    expect(Math.max(...ys(designShadow(turned, 'mature', sun)))).toBeGreaterThan(21)
  })

  it('designShadow skips plants not yet planted in the viewed year', () => {
    const p = newProject('Trees', 0)
    const tree = builtInPlant('acer-campestre')!
    const planting: Planting = {
      id: 'p',
      plantId: tree.id,
      position: { x: 5, y: 5 },
      plantedYear: 2030,
    }
    p.plantings = [planting]
    const sun = sunPositionAt(JUN, 720, NL)
    expect(designShadow(p, 2026, sun)).toEqual([])
    expect(designShadow(p, 'mature', sun).length).toBeGreaterThan(0)
  })
})
