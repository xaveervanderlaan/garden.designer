import type { ObjectKind } from '../model/schema'

/**
 * How each kind of element looks on the plan (SPEC §5). One table for the canvas, legend and PDF
 * export. M2 version: fill and outline per kind. Patterns and symbols follow in M8/M9.
 */
export type ElementStyle = { fill: string; stroke: string }

export const SELECTION_COLOR = '#2f80d1'
export const WARNING_COLOR = '#b3261e'
/** The line measured to calibrate the site plan's scale. */
export const CALIBRATION_COLOR = '#c25400'
export const PLOT_STYLE = { stroke: '#253325', fill: 'rgba(255, 255, 255, 0.6)' }
export const PLANTING_STYLE: ElementStyle = { fill: 'rgba(110, 168, 90, 0.85)', stroke: '#3f6f33' }

export const OBJECT_STYLES: Record<ObjectKind, ElementStyle> = {
  house: { fill: '#8a8d88', stroke: '#3e413c' },
  shed: { fill: '#b3b6af', stroke: '#5c6058' },
  greenhouse: { fill: '#dfeee6', stroke: '#6f8f7e' },
  pergola: { fill: 'rgba(181, 154, 120, 0.35)', stroke: '#8a6a45' },
  carport: { fill: '#c4c6c0', stroke: '#6f736b' },
  'raised-bed': { fill: '#b88b5e', stroke: '#6e4c2b' },
  terrace: { fill: '#d6d7d1', stroke: '#7d8178' },
  path: { fill: '#e6dcc6', stroke: '#a39276' },
  driveway: { fill: '#cfd0ca', stroke: '#7d8178' },
  gravel: { fill: '#ebe3cf', stroke: '#b3a383' },
  lawn: { fill: '#cfe5b4', stroke: '#8db36a' },
  fence: { fill: '#8a6a45', stroke: '#6e5235' },
  wall: { fill: '#7a7c76', stroke: '#585a55' },
  hedge: { fill: '#5e8f4e', stroke: '#3f6f33' },
  gate: { fill: '#a07c52', stroke: '#6e5235' },
  pond: { fill: '#b7daf0', stroke: '#4f8fbf' },
  furniture: { fill: '#e9d5b5', stroke: '#8a6a45' },
  lighting: { fill: '#ffe9a3', stroke: '#b38f1d' },
  play: { fill: '#f3c7a5', stroke: '#b36b3a' },
  compost: { fill: '#9c7a57', stroke: '#5c4129' },
  'rain-barrel': { fill: '#9fc3dc', stroke: '#4f7f9f' },
  'bed-ornamental': { fill: '#d9bf9c', stroke: '#8a6a45' },
  'bed-vegetable': { fill: '#c49a6c', stroke: '#7a5532' },
}

/** Grid line colours on the canvas. */
export const GRID_COLORS = { minor: '#e6ebe1', major: '#cdd6c6', background: '#f7f9f4' }
