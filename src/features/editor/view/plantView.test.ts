import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Planting } from '../../../model/schema'
import { useUiStore } from '../../../store/uiStore'
import { currentYear } from '../actions'
import { currentPlantView, growthViewOf, stepMonth, usePlantView } from './plantView'

const planted = (...years: number[]) => ({
  plantings: years.map((plantedYear, i): Planting => ({
    id: `p${i}`,
    plantId: 'acer-campestre',
    position: { x: 0, y: 0 },
    plantedYear,
  })),
})

describe('growthViewOf', () => {
  it('counts the stops from the earliest planting year', () => {
    const design = planted(2029, 2027, 2028)
    expect(growthViewOf(design, 'planting')).toBe(2027)
    expect(growthViewOf(design, '+1')).toBe(2028)
    expect(growthViewOf(design, '+3')).toBe(2030)
    expect(growthViewOf(design, '+5')).toBe(2032)
    expect(growthViewOf(design, '+10')).toBe(2037)
    expect(growthViewOf(design, 'mature')).toBe('mature')
  })

  it('counts from this year when nothing is planted yet', () => {
    expect(growthViewOf(planted(), 'planting')).toBe(currentYear())
    expect(growthViewOf(planted(), '+5', 2030)).toBe(2035)
  })
})

describe('the current plant view', () => {
  it('is the mature size in the usual colours by default', () => {
    expect(currentPlantView(planted(2027))).toEqual({ year: 'mature', month: null })
  })

  it('follows the view bar', () => {
    useUiStore.getState().setGrowthStop('+3')
    useUiStore.getState().setMonth(4)
    expect(currentPlantView(planted(2027))).toEqual({ year: 2030, month: 4 })
    useUiStore.getState().reset()
    expect(currentPlantView(planted(2027))).toEqual({ year: 'mature', month: null })
  })

  it('keeps the same object while the year and month stay the same', () => {
    const { result, rerender } = renderHook(({ design }) => usePlantView(design), {
      initialProps: { design: planted(2027) },
    })
    const first = result.current
    rerender({ design: planted(2027, 2028) })
    expect(result.current).toBe(first)
    act(() => useUiStore.getState().setGrowthStop('planting'))
    expect(result.current).toEqual({ year: 2027, month: null })
    rerender({ design: planted(2026, 2027) })
    expect(result.current).toEqual({ year: 2026, month: null })
    act(() => useUiStore.getState().reset())
  })
})

describe('stepMonth', () => {
  it('steps through the months and around the year', () => {
    expect(stepMonth(5, 1)).toBe(6)
    expect(stepMonth(12, 1)).toBe(1)
    expect(stepMonth(1, -1)).toBe(12)
    expect(stepMonth(null, 1)).toBe(1)
    expect(stepMonth(null, -1)).toBe(12)
  })
})
