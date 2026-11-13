import { currentLanguage } from '.'

/** Non-breaking space between a number and its unit. */
const NBSP = ' '

export function formatNumber(value: number, digits = 2, lang: string = currentLanguage()): string {
  return new Intl.NumberFormat(lang, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

/** "12.50 m" / "12,50 m". */
export function formatLength(metres: number, digits = 2, lang?: string): string {
  return `${formatNumber(metres, digits, lang)}${NBSP}m`
}

/** "300.00 m²" / "300,00 m²". */
export function formatArea(squareMetres: number, digits = 2, lang?: string): string {
  return `${formatNumber(squareMetres, digits, lang)}${NBSP}m²`
}

/** "60%" / "60%" (0.6 → 60 %, in the language's own style). */
export function formatPercent(fraction: number, lang: string = currentLanguage()): string {
  return new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: 0 }).format(
    fraction,
  )
}

/** Short label for a round length, as on a scale bar: "50 cm", "1 m", "2,5 m". */
export function formatRoundLength(metres: number, lang?: string): string {
  if (metres < 1) return `${formatNumber(Math.round(metres * 100), 0, lang)}${NBSP}cm`
  const digits = Number.isInteger(metres) ? 0 : 1
  return `${formatNumber(metres, digits, lang)}${NBSP}m`
}

/**
 * Parses a number typed by the user. Accepts a decimal comma or point ("12,5" and "12.5"), an
 * optional sign and an optional trailing "m". Thousands separators are not accepted, because
 * "1.250" means 1250 in Dutch but 1.25 in English. Returns undefined for anything else.
 */
export function parseNumber(input: string): number | undefined {
  const text = input.trim().replace(/\s*m$/i, '')
  if (!/^[-+]?(\d+([.,]\d*)?|[.,]\d+)$/.test(text)) return undefined
  const value = Number(text.replace(',', '.'))
  return Number.isFinite(value) ? value : undefined
}
