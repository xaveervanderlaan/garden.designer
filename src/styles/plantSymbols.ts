import type { Plant } from '../model/schema'
import { PLANT_COLOR_HEX } from './plantColors'

/**
 * Plant symbols (SPEC §5): one look per category, so plants are recognisable at a glance. A symbol
 * is a list of SVG paths in a unit circle (radius 1 = half the mature spread, centred on 0,0), so
 * the same data can be drawn as SVG (library) and as Konva paths on the plan (scaled by the
 * planting's radius).
 */
export type SymbolPart = {
  d: string
  fill?: string
  stroke?: string
  /** Stroke width in screen pixels (not scaled with the symbol). */
  strokeWidth?: number
  /** Opacity of the fill only, so outlines stay crisp. */
  fillOpacity?: number
}

const TRUNK_COLOR = '#5b4632'
const FRUIT_COLOR = '#c8372d'

const r3 = (n: number) => Math.round(n * 1000) / 1000
const pt = (angle: number, radius: number) =>
  `${r3(Math.cos(angle) * radius)} ${r3(Math.sin(angle) * radius)}`

function circle(radius: number, cx = 0, cy = 0): string {
  return `M ${r3(cx - radius)} ${r3(cy)} A ${radius} ${radius} 0 1 0 ${r3(cx + radius)} ${r3(cy)} A ${radius} ${radius} 0 1 0 ${r3(cx - radius)} ${r3(cy)} Z`
}

/** A cloud edge: `bumps` arcs bulging outward around a circle. */
function scalloped(radius: number, bumps: number): string {
  const inner = radius * 0.9
  const step = (2 * Math.PI) / bumps
  const chord = 2 * inner * Math.sin(step / 2)
  const arc = r3(chord * 0.6)
  let d = `M ${pt(0, inner)}`
  for (let i = 1; i <= bumps; i++) d += ` A ${arc} ${arc} 0 0 1 ${pt(i * step, inner)}`
  return `${d} Z`
}

/** Lines from the centre outward, every other one shorter. */
function rays(count: number, from: number, long: number, short: number): string {
  let d = ''
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * 2 * Math.PI - Math.PI / 2
    d += `M ${pt(angle, from)} L ${pt(angle, i % 2 ? short : long)} `
  }
  return d.trim()
}

/** Leaf shapes from the centre outward. */
function leaves(count: number, length: number, width: number, offset = -Math.PI / 2): string {
  let d = ''
  for (let i = 0; i < count; i++) {
    const a = offset + (i / count) * 2 * Math.PI
    const side = Math.atan2(width, length / 2)
    const sideLength = Math.hypot(width, length / 2)
    d += `M 0 0 Q ${pt(a - side, sideLength)} ${pt(a, length)} Q ${pt(a + side, sideLength)} 0 0 Z `
  }
  return d.trim()
}

/** An open spiral from the centre, for climbers. */
function spiral(turns: number, radius: number): string {
  const points: string[] = []
  const steps = turns * 24
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    points.push(pt(t * turns * 2 * Math.PI, t * radius))
  }
  return `M ${points.join(' L ')}`
}

/** Mixes a hex colour with black (amount 0–1). */
export function darken(hex: string, amount: number): string {
  const value = parseInt(hex.slice(1), 16)
  const channel = (shift: number) => Math.round(((value >> shift) & 255) * (1 - amount))
  return `#${[16, 8, 0].map((s) => channel(s).toString(16).padStart(2, '0')).join('')}`
}

/** The colour a plant is drawn in: its flowers for perennials and bulbs, otherwise its leaves. */
export function symbolColor(plant: Plant): string {
  const flower = plant.flowerColors[0]
  const usesFlower = plant.category === 'perennial' || plant.category === 'bulb'
  return PLANT_COLOR_HEX[usesFlower && flower ? flower : plant.foliageColor]
}

export function plantSymbol(plant: Plant): SymbolPart[] {
  const foliage = PLANT_COLOR_HEX[plant.foliageColor]
  const outline = darken(foliage, 0.4)
  const main = symbolColor(plant)

  switch (plant.category) {
    case 'tree':
      return [
        { d: circle(1), fill: foliage, fillOpacity: 0.55, stroke: outline, strokeWidth: 1.25 },
        { d: rays(8, 0.18, 0.82, 0.82), stroke: outline, strokeWidth: 1 },
        { d: circle(0.09), fill: TRUNK_COLOR },
      ]
    case 'shrub':
      return [
        {
          d: scalloped(1, 9),
          fill: foliage,
          fillOpacity: 0.85,
          stroke: outline,
          strokeWidth: 1.25,
        },
      ]
    case 'hedge':
      return [
        { d: scalloped(1, 14), fill: darken(foliage, 0.1), stroke: outline, strokeWidth: 1.25 },
      ]
    case 'perennial':
      return [{ d: circle(0.92), fill: main, stroke: darken(main, 0.35), strokeWidth: 1 }]
    case 'grass':
      return [
        { d: circle(0.95), fill: foliage, fillOpacity: 0.25 },
        { d: rays(16, 0, 0.98, 0.62), stroke: outline, strokeWidth: 1.25 },
      ]
    case 'fern':
      return [
        { d: leaves(7, 0.98, 0.16), fill: foliage, stroke: outline, strokeWidth: 0.75 },
        { d: circle(0.08), fill: outline },
      ]
    case 'climber':
      return [
        { d: circle(0.95), fill: foliage, fillOpacity: 0.3, stroke: outline, strokeWidth: 1 },
        { d: spiral(2.25, 0.8), stroke: outline, strokeWidth: 1.25 },
      ]
    case 'bulb':
      return [0, 1, 2].map((i) => {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 3
        const d = circle(0.44, Math.cos(angle) * 0.48, Math.sin(angle) * 0.48)
        return { d, fill: main, stroke: darken(main, 0.35), strokeWidth: 1 }
      })
    case 'vegetable':
      return [
        { d: circle(0.95), stroke: outline, strokeWidth: 1 },
        {
          d: leaves(4, 0.9, 0.32, -Math.PI / 4),
          fill: foliage,
          stroke: outline,
          strokeWidth: 0.75,
        },
      ]
    case 'herb':
      return [
        { d: circle(0.95), fill: foliage, fillOpacity: 0.35, stroke: outline, strokeWidth: 1 },
        { d: leaves(6, 0.75, 0.2), fill: foliage, stroke: outline, strokeWidth: 0.75 },
      ]
    case 'fruit': {
      const base: SymbolPart[] =
        plant.heightM >= 3
          ? [
              {
                d: circle(1),
                fill: foliage,
                fillOpacity: 0.55,
                stroke: outline,
                strokeWidth: 1.25,
              },
              { d: circle(0.09), fill: TRUNK_COLOR },
            ]
          : [
              {
                d: scalloped(1, 9),
                fill: foliage,
                fillOpacity: 0.85,
                stroke: outline,
                strokeWidth: 1.25,
              },
            ]
      const fruits = [0, 1, 2, 3, 4]
        .map((i) => {
          const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 5
          return circle(0.12, Math.cos(angle) * 0.55, Math.sin(angle) * 0.55)
        })
        .join(' ')
      return [...base, { d: fruits, fill: FRUIT_COLOR }]
    }
  }
}
