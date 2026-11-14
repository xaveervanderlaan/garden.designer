import { describe, expect, it } from 'vitest'
import i18n from '.'
import { formatMonths, monthLong, monthRuns, monthShort } from './months'

describe('monthRuns', () => {
  it.each([
    [[], []],
    [[6, 7, 8], [[6, 7, 8]]],
    [
      [4, 5, 6, 9],
      [[4, 5, 6], [9]],
    ],
    [[1, 2, 3, 11, 12], [[11, 12, 1, 2, 3]]],
    [
      [12, 1, 6],
      [[6], [12, 1]],
    ],
    [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]]],
    [[8, 7, 7, 13], [[7, 8]]],
  ])('%j → %j', (months, runs) => expect(monthRuns(months)).toEqual(runs))
})

describe('month names', () => {
  it('formats month lists in English and Dutch', async () => {
    expect(formatMonths([6, 7, 8])).toBe('Jun–Aug')
    expect(formatMonths([3, 11, 12, 1])).toBe('Mar, Nov–Jan')
    expect(monthShort(5)).toBe('May')
    expect(monthLong(10)).toBe('October')

    await i18n.changeLanguage('nl')
    expect(formatMonths([3, 4, 5])).toBe('mrt–mei')
    expect(monthLong(10)).toBe('oktober')
    expect(monthShort(13)).toBe('')
  })
})
