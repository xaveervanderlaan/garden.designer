import type { PlantColor } from '../model/schema'

/**
 * Hex values of the plant colour palette. Used for swatches in the library, the plant symbols on
 * the plan and (later) the seasonal view and the legend.
 */
export const PLANT_COLOR_HEX: Record<PlantColor, string> = {
  white: '#f8f8f3',
  cream: '#f1e4b8',
  yellow: '#f2cb2e',
  orange: '#ec8a2b',
  red: '#cf3a2f',
  pink: '#f09cc0',
  magenta: '#c4318a',
  purple: '#7c45a3',
  lilac: '#b59bdb',
  blue: '#4d78cc',
  lime: '#b5cc47',
  bronze: '#a87b47',
  green: '#5d9a47',
  'dark-green': '#2f5c2d',
  'grey-green': '#8fa68b',
  silver: '#c3ccc5',
  'blue-green': '#5f9794',
  gold: '#d8bf35',
  burgundy: '#6e2739',
  variegated: '#a9c78b',
}

/** Light colours need a darker outline to stand out on a white background. */
const LIGHT_COLORS = new Set<PlantColor>(['white', 'cream', 'silver', 'lime', 'yellow'])

export function needsOutline(color: PlantColor): boolean {
  return LIGHT_COLORS.has(color)
}
