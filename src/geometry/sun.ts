import { getPosition, getTimes } from 'suncalc'
import type { Point } from '../model/schema'

/**
 * Sun position, sunrise/sunset and sun directions on the plan (SPEC §4.5), via suncalc v2.
 *
 * Conventions:
 * - **Dates and times** are local wall-clock time in a time zone (default Europe/Amsterdam, as the
 *   app is for Dutch gardens). `localInstant` turns a local date + minutes after midnight into a
 *   UTC instant, with daylight saving time handled through `Intl.DateTimeFormat`, so the result
 *   doesn't depend on the machine's own time zone. Instants are `Date`s or epoch milliseconds.
 * - **Sun position** (`SunPosition`): suncalc v2 gives degrees: the azimuth is a compass bearing
 *   (clockwise from north: 0 = N, 90 = E, 180 = S, 270 = W) and the altitude is the apparent
 *   (refraction-corrected) height above the horizon. (suncalc v1 used radians and measured the
 *   azimuth from south; v2 doesn't.)
 * - **The plan**: metres, x right, y down. `settings.northAngleDeg` is the clockwise angle on
 *   screen from "up" to north, so 0 means north points up the screen (and east to the right).
 *   A compass bearing b therefore points along `(sin(north + b), −cos(north + b))` on the plan.
 */

const DEG = Math.PI / 180

export const DEFAULT_TIME_ZONE = 'Europe/Amsterdam'

/** A calendar date; `month` runs from 1 (January) to 12. */
export type LocalDate = { year: number; month: number; day: number }

export type GeoLocation = { lat: number; lng: number }

/** Degrees. `azimuthDeg` is a compass bearing (clockwise from north), `altitudeDeg` is apparent. */
export type SunPosition = { altitudeDeg: number; azimuthDeg: number }

/**
 * Shadows are computed as if the sun stood at least this high: it keeps them finite (at most
 * 1 / tan(1°) ≈ 57 times the height of what casts them) while the sun is on the horizon.
 */
export const MIN_SHADOW_ALTITUDE_DEG = 1

// --- Dates and time zones -------------------------------------------------------------------

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Parses "YYYY-MM-DD" (what `<input type="date">` gives). Returns null for anything else. */
export function parseLocalDate(text: string): LocalDate | null {
  const match = ISO_DATE.exec(text)
  if (!match) return null
  const date = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
  const check = new Date(Date.UTC(date.year, date.month - 1, date.day))
  return check.getUTCMonth() === date.month - 1 && check.getUTCDate() === date.day ? date : null
}

/** "YYYY-MM-DD". */
export function formatLocalDate({ year, month, day }: LocalDate): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, '0')
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`
}

const formatters = new Map<string, Intl.DateTimeFormat>()

function wallClockFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
    formatters.set(timeZone, formatter)
  }
  return formatter
}

/** The wall-clock time in the zone at an instant, encoded as if it were UTC (epoch ms). */
function wallClockMs(instant: number, timeZone: string): number {
  const fields: Record<string, number> = {}
  for (const part of wallClockFormatter(timeZone).formatToParts(new Date(instant))) {
    if (part.type !== 'literal') fields[part.type] = Number(part.value)
  }
  const { year = 1970, month = 1, day = 1, hour = 0, minute = 0, second = 0 } = fields
  return Date.UTC(year, month - 1, day, hour, minute, second)
}

/** Minutes the zone is ahead of UTC at an instant (60 for CET, 120 for CEST). */
export function timeZoneOffsetMinutes(instant: Date | number, timeZone = DEFAULT_TIME_ZONE) {
  const ms = Math.floor(Number(instant) / 1000) * 1000 // the formatter drops milliseconds
  return Math.round((wallClockMs(ms, timeZone) - ms) / 60_000)
}

/**
 * The instant at which the clocks in the zone show `minutes` after midnight on `date` (minutes
 * may run past 24 h). Around the switches to and from daylight saving time, a time that doesn't
 * exist (02:30 on the last Sunday of March) moves forward by an hour, and a time that occurs
 * twice (02:30 on the last Sunday of October) gives the second one (winter time).
 */
export function localInstant(date: LocalDate, minutes: number, timeZone = DEFAULT_TIME_ZONE): Date {
  const wall = Date.UTC(date.year, date.month - 1, date.day) + minutes * 60_000
  const guess = timeZoneOffsetMinutes(wall, timeZone)
  let instant = wall - guess * 60_000
  const actual = timeZoneOffsetMinutes(instant, timeZone)
  if (actual !== guess) instant = wall - actual * 60_000
  return new Date(instant)
}

/** The local date, and the minutes after local midnight, of an instant. */
export function localDateTime(
  instant: Date | number,
  timeZone = DEFAULT_TIME_ZONE,
): { date: LocalDate; minutes: number } {
  const ms = Number(instant)
  const wall = ms + timeZoneOffsetMinutes(ms, timeZone) * 60_000
  const d = new Date(wall)
  return {
    date: { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() },
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60,
  }
}

// --- Sun position and times -----------------------------------------------------------------

export function sunPosition(instant: Date | number, location: GeoLocation): SunPosition {
  const { altitude, azimuth } = getPosition(new Date(instant), location.lat, location.lng)
  return { altitudeDeg: altitude, azimuthDeg: azimuth }
}

/** Sun position at a local date and time (minutes after midnight). */
export function sunPositionAt(
  date: LocalDate,
  minutes: number,
  location: GeoLocation,
  timeZone = DEFAULT_TIME_ZONE,
): SunPosition {
  return sunPosition(localInstant(date, minutes, timeZone), location)
}

/** The sun is up while its centre is above the horizon. Shadow functions return none otherwise. */
export const isSunUp = (sun: SunPosition) => sun.altitudeDeg > 0

export type SunTimes = {
  /** When the sun's upper edge crosses the horizon; null when it doesn't rise or set that day. */
  sunrise: Date | null
  sunset: Date | null
  /** The sun's highest point. */
  solarNoon: Date
  /** Polar day (up all day) or polar night (down all day); both false in the Netherlands. */
  alwaysUp: boolean
  alwaysDown: boolean
}

export function sunTimes(
  date: LocalDate,
  location: GeoLocation,
  timeZone = DEFAULT_TIME_ZONE,
): SunTimes {
  // suncalc picks the solar day nearest to the instant it's given: local noon is safely inside.
  const times = getTimes(localInstant(date, 12 * 60, timeZone), location.lat, location.lng)
  return {
    sunrise: times.sunrise,
    sunset: times.sunset,
    solarNoon: times.solarNoon,
    alwaysUp: times.alwaysUp === true,
    alwaysDown: times.alwaysDown === true,
  }
}

// --- Directions on the plan -----------------------------------------------------------------

/**
 * Unit vector on the plan (x right, y down) for a compass bearing (degrees clockwise from north),
 * given the plan's north angle (degrees clockwise on screen from "up" to north).
 */
export function bearingOnPlan(bearingDeg: number, northAngleDeg: number): Point {
  const a = (northAngleDeg + bearingDeg) * DEG
  return { x: Math.sin(a) || 0, y: -Math.cos(a) || 0 }
}

/** Unit vector on the plan pointing north (for a north arrow). */
export const northOnPlan = (northAngleDeg: number) => bearingOnPlan(0, northAngleDeg)

/** Unit vector on the plan pointing (horizontally) towards the sun. */
export const sunDirectionOnPlan = (sun: SunPosition, northAngleDeg: number) =>
  bearingOnPlan(sun.azimuthDeg, northAngleDeg)

/** Unit vector on the plan in which shadows fall: away from the sun. */
export const shadowDirectionOnPlan = (sun: SunPosition, northAngleDeg: number) =>
  bearingOnPlan(sun.azimuthDeg + 180, northAngleDeg)

/**
 * Where the shadow of a point 1 m above the ground lands, relative to the point's foot: a vector
 * on the plan (metres per metre of height) pointing away from the sun, of length 1 / tan(altitude)
 * (the altitude kept at least MIN_SHADOW_ALTITUDE_DEG). Null when the sun is down.
 */
export function shadowStep(sun: SunPosition, northAngleDeg: number): Point | null {
  return isSunUp(sun) ? shadowVector(sun, northAngleDeg) : null
}

/**
 * shadowStep without the check that the sun is up. The sun-hours map uses it for every moment
 * between sunrise and sunset: the sun's upper edge is above the horizon then, even in the few
 * minutes when its centre isn't.
 */
export function shadowVector(sun: SunPosition, northAngleDeg: number): Point {
  const length = 1 / Math.tan(Math.max(sun.altitudeDeg, MIN_SHADOW_ALTITUDE_DEG) * DEG)
  const direction = shadowDirectionOnPlan(sun, northAngleDeg)
  return { x: direction.x * length, y: direction.y * length }
}
