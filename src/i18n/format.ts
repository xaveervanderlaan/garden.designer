import { currentLanguage } from '.'

/** Date and time in the UI language, e.g. "13 Nov 2026, 18:42" / "13 nov 2026, 18:42". */
export function formatDateTime(epochMs: number): string {
  return new Intl.DateTimeFormat(currentLanguage(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(epochMs)
}

/** A date in the UI language, e.g. "13 November 2026" / "13 november 2026". */
export function formatDate(epochMs: number): string {
  return new Intl.DateTimeFormat(currentLanguage(), { dateStyle: 'long' }).format(epochMs)
}
