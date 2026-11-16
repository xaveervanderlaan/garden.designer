import type { ObjectKind } from '../../../model/schema'
import { OBJECT_STYLES } from '../../../styles/elementStyles'

const W = 28
const H = 20
/** Pattern lines in the swatch, in pixels apart. */
const GAP = 5

/** Lines (x1, y1, x2, y2) of a kind's pattern in a W × H box. */
function patternLines(kind: ObjectKind): number[][] {
  const pattern = OBJECT_STYLES[kind].pattern
  if (!pattern) return []
  const lines: number[][] = []
  switch (pattern.kind) {
    case 'rows':
      for (let y = GAP / 2 + 1; y < H; y += GAP) lines.push([0, y, W, y])
      break
    case 'hatch':
      // 45° lines, clipped by the swatch's clip path.
      for (let x = -H; x < W; x += GAP + 1) lines.push([x, 0, x + H, H])
      break
    case 'grid':
      for (let x = GAP + 1; x < W; x += GAP + 1) lines.push([x, 0, x, H])
      for (let y = GAP + 1; y < H; y += GAP + 1) lines.push([0, y, W, y])
      break
    case 'beams':
      for (let x = GAP; x < W; x += GAP) lines.push([x, 0, x, H])
      break
    case 'cross':
      lines.push([0, 0, W, H], [W, 0, 0, H])
      break
  }
  return lines
}

/** A small sample of how a kind looks on the plan (its fill, pattern and outline), for menus. */
export function ObjectSwatch({ kind }: { kind: ObjectKind }) {
  const style = OBJECT_STYLES[kind]
  const pattern = style.pattern
  const clipId = `swatch-${kind}`
  const width = pattern && 'widthPx' in pattern ? (pattern.widthPx ?? 1) : 1
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
      <defs>
        <clipPath id={clipId}>
          <rect x={1} y={1} width={W - 2} height={H - 2} />
        </clipPath>
      </defs>
      <rect x={1} y={1} width={W - 2} height={H - 2} fill={style.fill} />
      {pattern && (
        <g clipPath={`url(#${clipId})`} stroke={pattern.color} strokeWidth={width}>
          {patternLines(kind).map(([x1, y1, x2, y2], i) => (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />
          ))}
        </g>
      )}
      <rect
        x={1}
        y={1}
        width={W - 2}
        height={H - 2}
        fill="none"
        stroke={style.stroke}
        strokeWidth={Math.min(style.strokeWidthPx ?? 1.25, 2.5)}
      />
    </svg>
  )
}
