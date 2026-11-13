import { describe, expect, it } from 'vitest'
import { formatArea, formatLength, formatRoundLength, parseNumber } from './units'

const nbsp = ' '

describe('formatting', () => {
  it('formats lengths and areas per language', () => {
    expect(formatLength(12.5, 2, 'en')).toBe(`12.50${nbsp}m`)
    expect(formatLength(12.5, 2, 'nl')).toBe(`12,50${nbsp}m`)
    expect(formatArea(300, 2, 'en')).toBe(`300.00${nbsp}m²`)
    expect(formatArea(300, 2, 'nl')).toBe(`300,00${nbsp}m²`)
  })

  it('formats round lengths for the scale bar', () => {
    expect(formatRoundLength(0.5, 'en')).toBe(`50${nbsp}cm`)
    expect(formatRoundLength(0.02, 'nl')).toBe(`2${nbsp}cm`)
    expect(formatRoundLength(5, 'en')).toBe(`5${nbsp}m`)
    expect(formatRoundLength(2.5, 'nl')).toBe(`2,5${nbsp}m`)
  })
})

describe('parseNumber', () => {
  it.each([
    ['12,5', 12.5],
    ['12.5', 12.5],
    [' 7 ', 7],
    ['-3,25', -3.25],
    ['+4', 4],
    [',5', 0.5],
    ['8.', 8],
    ['12,5 m', 12.5],
    ['20m', 20],
  ])('parses %j as %s', (input, expected) => {
    expect(parseNumber(input)).toBe(expected)
  })

  it.each(['', 'abc', '1.234,5', '1,234.5', '12,5,3', '--1', '5 cm', 'm'])(
    'rejects %j',
    (input) => {
      expect(parseNumber(input)).toBeUndefined()
    },
  )
})
