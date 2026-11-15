import { afterEach, describe, expect, it } from 'vitest'
import {
  bearingOnPlan,
  formatLocalDate,
  isSunUp,
  localDateTime,
  localInstant,
  MIN_SHADOW_ALTITUDE_DEG,
  northOnPlan,
  parseLocalDate,
  shadowDirectionOnPlan,
  shadowStep,
  sunDirectionOnPlan,
  sunPosition,
  sunPositionAt,
  sunTimes,
  timeZoneOffsetMinutes,
} from './sun'

const AMSTERDAM = { lat: 52.37, lng: 4.9 }
const JUNE_21 = { year: 2026, month: 6, day: 21 }
const DEC_21 = { year: 2026, month: 12, day: 21 }

const iso = (date: Date | null) => date?.toISOString()
/** "HH:MM" local time in Amsterdam. */
function localClock(date: Date | null): string {
  const minutes = Math.round(localDateTime(date!).minutes)
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}
const minutesBetween = (a: string, b: string) => {
  const toMinutes = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3))
  return Math.abs(toMinutes(a) - toMinutes(b))
}
const expectVector = (actual: { x: number; y: number }, x: number, y: number) => {
  expect(actual.x).toBeCloseTo(x, 9)
  expect(actual.y).toBeCloseTo(y, 9)
}

/** Node's environment (the app's types don't include Node's). */
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } })
  .process.env

describe('local dates and times', () => {
  const originalTz = env.TZ
  afterEach(() => {
    // Assigning undefined would set the text "undefined".
    if (originalTz === undefined) delete env.TZ
    else env.TZ = originalTz
  })

  it('parses and formats ISO dates', () => {
    expect(parseLocalDate('2026-06-21')).toEqual(JUNE_21)
    expect(parseLocalDate('2026-02-30')).toBeNull()
    expect(parseLocalDate('21-06-2026')).toBeNull()
    expect(formatLocalDate({ year: 2026, month: 3, day: 5 })).toBe('2026-03-05')
  })

  it('handles daylight saving time: 12:00 in summer and winter differ by an hour in UTC', () => {
    expect(iso(localInstant(JUNE_21, 12 * 60))).toBe('2026-06-21T10:00:00.000Z')
    expect(iso(localInstant(DEC_21, 12 * 60))).toBe('2026-12-21T11:00:00.000Z')
    expect(timeZoneOffsetMinutes(Date.UTC(2026, 5, 21, 10))).toBe(120)
    expect(timeZoneOffsetMinutes(Date.UTC(2026, 11, 21, 11))).toBe(60)
  })

  it('moves a time that does not exist forward and picks winter time for a repeated one', () => {
    // 29 March 2026: 02:00 CET becomes 03:00 CEST.
    expect(iso(localInstant({ year: 2026, month: 3, day: 29 }, 2 * 60 + 30))).toBe(
      '2026-03-29T01:30:00.000Z',
    )
    expect(iso(localInstant({ year: 2026, month: 3, day: 29 }, 60 + 30))).toBe(
      '2026-03-29T00:30:00.000Z',
    )
    // 25 October 2026: 03:00 CEST becomes 02:00 CET, so 02:30 happens twice.
    expect(iso(localInstant({ year: 2026, month: 10, day: 25 }, 2 * 60 + 30))).toBe(
      '2026-10-25T01:30:00.000Z',
    )
  })

  it('does not depend on the time zone of the machine', () => {
    const before = iso(localInstant(JUNE_21, 9 * 60 + 15))
    env.TZ = 'America/New_York'
    expect(new Date(2026, 5, 21).getTimezoneOffset()).not.toBe(-120) // the change took effect
    expect(iso(localInstant(JUNE_21, 9 * 60 + 15))).toBe(before)
    expect(localDateTime(new Date('2026-06-21T07:15:00Z'))).toEqual({
      date: JUNE_21,
      minutes: 9 * 60 + 15,
    })
  })

  it('turns an instant back into a local date and time', () => {
    expect(localDateTime(localInstant(DEC_21, 23 * 60 + 59))).toEqual({
      date: DEC_21,
      minutes: 23 * 60 + 59,
    })
    // 26 h after midnight is 02:00 the next day.
    expect(localDateTime(localInstant(DEC_21, 26 * 60)).date).toEqual({ ...DEC_21, day: 22 })
  })
})

describe('sun position and times', () => {
  it('reaches about 61° at solar noon on 21 June and 14° on 21 December in Amsterdam', () => {
    const june = sunTimes(JUNE_21, AMSTERDAM)
    const december = sunTimes(DEC_21, AMSTERDAM)
    // 90° − 52.37° ± 23.44° (plus a little refraction)
    expect(sunPosition(june.solarNoon, AMSTERDAM).altitudeDeg).toBeCloseTo(61.1, 0)
    expect(sunPosition(december.solarNoon, AMSTERDAM).altitudeDeg).toBeCloseTo(14.2, 0)
    // At solar noon the sun is due south.
    expect(sunPosition(june.solarNoon, AMSTERDAM).azimuthDeg).toBeCloseTo(180, 0)
    // Solar noon in Amsterdam is around 13:40 in summer and 12:40 in winter.
    expect(minutesBetween(localClock(june.solarNoon), '13:42')).toBeLessThan(5)
    expect(minutesBetween(localClock(december.solarNoon), '12:41')).toBeLessThan(5)
  })

  it('gives sunrise and sunset at about the published times', () => {
    const june = sunTimes(JUNE_21, AMSTERDAM)
    const december = sunTimes(DEC_21, AMSTERDAM)
    expect(minutesBetween(localClock(june.sunrise), '05:18')).toBeLessThan(5)
    expect(minutesBetween(localClock(june.sunset), '22:06')).toBeLessThan(5)
    expect(minutesBetween(localClock(december.sunrise), '08:48')).toBeLessThan(5)
    expect(minutesBetween(localClock(december.sunset), '16:29')).toBeLessThan(5)
    expect(june.alwaysUp || june.alwaysDown).toBe(false)
    // The sun rises in the north-east in June and in the south-east in December.
    expect(sunPosition(june.sunrise!, AMSTERDAM).azimuthDeg).toBeLessThan(60)
    expect(sunPosition(december.sunrise!, AMSTERDAM).azimuthDeg).toBeGreaterThan(120)
  })

  it('reports polar day and night', () => {
    const svalbard = { lat: 78.2, lng: 15.6 }
    expect(sunTimes(JUNE_21, svalbard)).toMatchObject({ sunrise: null, alwaysUp: true })
    expect(sunTimes(DEC_21, svalbard)).toMatchObject({ sunset: null, alwaysDown: true })
  })

  it('knows when the sun is up', () => {
    expect(isSunUp(sunPositionAt(JUNE_21, 12 * 60, AMSTERDAM))).toBe(true)
    expect(isSunUp(sunPositionAt(JUNE_21, 2 * 60, AMSTERDAM))).toBe(false)
  })
})

describe('directions on the plan', () => {
  it('maps compass bearings to the plan with north up', () => {
    expectVector(bearingOnPlan(0, 0), 0, -1) // north: up the screen
    expectVector(bearingOnPlan(90, 0), 1, 0) // east: right
    expectVector(bearingOnPlan(180, 0), 0, 1) // south: down
    expectVector(bearingOnPlan(270, 0), -1, 0) // west: left
  })

  it('rotates with the north angle (clockwise on screen)', () => {
    expectVector(northOnPlan(90), 1, 0) // north points right
    expectVector(bearingOnPlan(90, 90), 0, 1) // so east points down
    expectVector(bearingOnPlan(180, 90), -1, 0) // and south left
    const half = Math.SQRT1_2
    expectVector(northOnPlan(45), half, -half)
  })

  it('points towards the sun, and shadows away from it', () => {
    const southSun = { altitudeDeg: 45, azimuthDeg: 180 }
    expectVector(sunDirectionOnPlan(southSun, 0), 0, 1)
    expectVector(shadowDirectionOnPlan(southSun, 0), 0, -1)
    expectVector(shadowDirectionOnPlan({ altitudeDeg: 30, azimuthDeg: 90 }, 0), -1, 0)
  })

  it('makes shadows 1 / tan(altitude) long per metre of height', () => {
    expectVector(shadowStep({ altitudeDeg: 45, azimuthDeg: 180 }, 0)!, 0, -1)
    const low = shadowStep({ altitudeDeg: 30, azimuthDeg: 270 }, 0)!
    expectVector(low, Math.sqrt(3), 0) // the evening sun in the west throws shadows east
    // Near the horizon the length is capped; below it there are no shadows.
    const capped = shadowStep({ altitudeDeg: 0.2, azimuthDeg: 180 }, 0)!
    expect(-capped.y).toBeCloseTo(1 / Math.tan((MIN_SHADOW_ALTITUDE_DEG * Math.PI) / 180), 9)
    expect(shadowStep({ altitudeDeg: -1, azimuthDeg: 180 }, 0)).toBeNull()
  })
})
