import { OBJECT_PRESETS, symbolFor } from '../../../model/objectKinds'
import type { ObjectKind } from '../../../model/schema'
import { type ElementPattern, OBJECT_STYLES, objectStyle } from '../../../styles/elementStyles'

const W = 28
const H = 20
/** Pattern lines in the swatch, in pixels apart. */
const GAP = 5

/** Lines (x1, y1, x2, y2) of a kind's pattern in a W × H box. */
function patternLines(pattern: ElementPattern | undefined): number[][] {
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
    case 'planks':
      for (let y = 4; y < H; y += 4) lines.push([0, y, W, y])
      break
    case 'bond':
      for (let y = GAP; y < H; y += GAP) lines.push([0, y, W, y])
      for (let y = 0, row = 0; y < H; y += GAP, row++) {
        for (let x = row % 2 === 0 ? 8 : 4; x < W; x += 8) lines.push([x, y, x, y + GAP])
      }
      break
    case 'dots':
      break
  }
  return lines
}

/** Dot centres (staggered) for a `dots` pattern. */
function patternDots(pattern: ElementPattern | undefined): number[][] {
  if (pattern?.kind !== 'dots') return []
  const dots: number[][] = []
  for (let y = 3, row = 0; y < H; y += 4, row++) {
    for (let x = row % 2 === 0 ? 3 : 5; x < W; x += 4) dots.push([x, y])
  }
  return dots
}

/** A symbol kind's swatch: its default variant's box or circle, scaled to fit. */
function SymbolSwatch({ kind, variant }: { kind: ObjectKind; variant?: string }) {
  const style = OBJECT_STYLES[kind]
  const symbol = symbolFor(kind, variant)
  const stroke = { fill: style.fill, stroke: style.stroke, strokeWidth: 1.25 }
  if (!symbol || symbol.round) {
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
        <circle cx={W / 2} cy={H / 2} r={H / 2 - 2} {...stroke} />
      </svg>
    )
  }
  const scale = Math.min((W - 4) / symbol.widthM, (H - 4) / symbol.depthM)
  const w = symbol.widthM * scale
  const d = symbol.depthM * scale
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
      <rect x={(W - w) / 2} y={(H - d) / 2} width={w} height={d} {...stroke} />
    </svg>
  )
}

/** A boundary kind's swatch: a band across, with posts for a fence or gate. */
function LineSwatch({ kind }: { kind: ObjectKind }) {
  const style = OBJECT_STYLES[kind]
  const posts = kind === 'fence' ? [3, W / 2, W - 3] : kind === 'gate' ? [3, W - 3] : []
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
      <line
        x1={2}
        y1={H / 2}
        x2={W - 2}
        y2={H / 2}
        stroke={style.fill}
        strokeWidth={kind === 'hedge' ? 7 : kind === 'wall' ? 5 : 3}
        strokeDasharray={kind === 'gate' ? '4 3' : undefined}
      />
      {posts.map((x) => (
        <rect key={x} x={x - 2} y={H / 2 - 2} width={4} height={4} fill={style.stroke} />
      ))}
    </svg>
  )
}

/** A small sample of how a kind looks on the plan (its fill, pattern and outline), for menus. */
export function ObjectSwatch({
  kind,
  variant,
  material,
}: {
  kind: ObjectKind
  variant?: string
  material?: string
}) {
  const shape = OBJECT_PRESETS[kind].shape
  if (shape === 'point') return <SymbolSwatch kind={kind} variant={variant} />
  if (shape === 'polyline') return <LineSwatch kind={kind} />
  const style = objectStyle({ kind, material })
  const pattern = style.pattern
  const clipId = `swatch-${kind}-${material ?? ''}`
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
          {patternLines(pattern).map(([x1, y1, x2, y2], i) => (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />
          ))}
          {patternDots(pattern).map(([cx, cy], i) => (
            <circle key={i} cx={cx} cy={cy} r={0.9} fill={pattern.color} stroke="none" />
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
