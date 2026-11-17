import { useMemo } from 'react'
import {
  type GeoLocation,
  type LocalDate,
  type SunPosition,
  localDateTime,
  sunPositionAt,
  sunTimes,
} from '../../../geometry/sun'
import { type MultiPolygon, shadowAt } from '../../../geometry/shadows'
import { projectCasters } from '../../../geometry/projectCasters'
import { type GrowthView, isPlanted, plantSizeAt } from '../../../model/growth'
import type { Point, Project } from '../../../model/schema'
import { type SunMoment, useUiStore } from '../../../store/uiStore'

/** Time slider granularity in minutes. */
export const SUN_STEP_MIN = 5
const PLAY_STEP_MIN = 10
const DAY_MIN = 24 * 60
const SNAP_DEG = 15

export type SunRange = { min: number; max: number; noon: number }

const minutesOf = (date: LocalDate, instant: Date) => {
  const local = localDateTime(instant)
  const dayShift = Math.round(
    (Date.UTC(local.date.year, local.date.month - 1, local.date.day) -
      Date.UTC(date.year, date.month - 1, date.day)) /
      60_000,
  )
  return local.minutes + dayShift
}

/** Sunrise (rounded up) to sunset (rounded down) in minutes after local midnight, plus solar noon. */
export function sunRange(date: LocalDate, location: GeoLocation): SunRange {
  const times = sunTimes(date, location)
  const noon = Math.round(minutesOf(date, times.solarNoon))
  if (!times.sunrise || !times.sunset) return { min: 0, max: DAY_MIN - SUN_STEP_MIN, noon }
  const min = Math.ceil(minutesOf(date, times.sunrise) / SUN_STEP_MIN) * SUN_STEP_MIN
  const max = Math.floor(minutesOf(date, times.sunset) / SUN_STEP_MIN) * SUN_STEP_MIN
  return { min, max, noon }
}

const clampMinutes = (minutes: number, range: SunRange) =>
  Math.min(range.max, Math.max(range.min, minutes))

/** Today, now while the sun is up, else solar noon. */
export function defaultSunMoment(location: GeoLocation, now = Date.now()): SunMoment {
  const { date, minutes } = localDateTime(now)
  const range = sunRange(date, location)
  const up = minutes >= range.min && minutes <= range.max
  const rounded = Math.round(minutes / SUN_STEP_MIN) * SUN_STEP_MIN
  return {
    date,
    minutes: up
      ? clampMinutes(rounded, range)
      : Math.round(range.noon / SUN_STEP_MIN) * SUN_STEP_MIN,
  }
}

/** Keeps the time inside the day's sunrise..sunset (after a date change). */
export function clampMoment(moment: SunMoment, location: GeoLocation): SunMoment {
  return { ...moment, minutes: clampMinutes(moment.minutes, sunRange(moment.date, location)) }
}

export const QUICK_PICK_MONTHS = [3, 6, 9, 12] as const

/** The 21st of a month, for the quick picks. */
export const quickPick = (year: number, month: 3 | 6 | 9 | 12): LocalDate => ({
  year,
  month,
  day: 21,
})

/** "08:05" (24 h in every language). */
export function formatClock(minutes: number): string {
  const total = Math.round(minutes)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
}

/** The next time while playing the day; null once past sunset. */
export function playStep(minutes: number, range: SunRange): number | null {
  const next = minutes + PLAY_STEP_MIN
  return next > range.max ? null : next
}

/** An angle in whole degrees, 0–359. */
export function normaliseAngle(deg: number): number {
  return ((Math.round(deg) % 360) + 360) % 360
}

/** The angle clockwise from "up" of the pointer around the centre; snap rounds to 15°. */
export function northAngleFromPointer(centre: Point, pointer: Point, snap = false): number {
  const deg = (Math.atan2(pointer.x - centre.x, -(pointer.y - centre.y)) * 180) / Math.PI
  return normaliseAngle(snap ? Math.round(deg / SNAP_DEG) * SNAP_DEG : deg)
}

/** Plant sizes for projectCasters in a growth year (not yet planted: no size). */
export const growthPlantSize =
  (year: GrowthView): NonNullable<Parameters<typeof projectCasters>[1]>['plantSize'] =>
  (planting, plant) =>
    isPlanted(planting.plantedYear, year)
      ? plantSizeAt(plant, planting.plantedYear, year)
      : { heightM: 0, spreadM: 0 }

/** The merged shadow of everything that casts one, at the plant sizes of the viewed year. */
export function designShadow(project: Project, year: GrowthView, sun: SunPosition): MultiPolygon {
  const casters = projectCasters(project, { plantSize: growthPlantSize(year) })
  return shadowAt(casters, sun, project.settings.northAngleDeg)
}

/** The sun's position at the view bar's moment; null when the sun is off. */
export function useSunPosition(project: Pick<Project, 'settings'> | null): SunPosition | null {
  const sun = useUiStore((s) => s.sun)
  const location = project?.settings.location
  return useMemo(
    () => (sun && location ? sunPositionAt(sun.date, sun.minutes, location) : null),
    [sun, location],
  )
}
