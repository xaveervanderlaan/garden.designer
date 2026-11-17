import { pointInPolygon, polygonArea } from '../geometry/polygon'
import { MUST_HAVE_UNITS, baseRefs } from '../model/brief'
import { OBJECT_PRESETS, SYMBOL_VARIANTS, materialsFor } from '../model/objectKinds'
import { findPlant } from '../model/plants'
import { cornerLabel } from '../model/plot'
import type { Brief, GardenObject, ObjectKind, Point, Project } from '../model/schema'
import { catalogueRows, num, promptPlants } from './catalogue'
import { ANSWER_FORMAT, PROPOSAL_OBJECT_KINDS, answerJsonSchema } from './format'
import type { CoarseSunMap } from './sunGrid'

/**
 * The prompt the user copies into Claude: self-contained, and built only from the plot, the items,
 * custom plants, a few settings and the brief. The design's name, location, site plan, notes and
 * labels are never included. Instructions are in English; the answer's texts in the UI language.
 */

export type PromptInput = {
  /** Only plot, objects, plantings, customPlants, settings (north, soil, overlap) and brief. */
  project: Pick<Project, 'plot' | 'objects' | 'plantings' | 'customPlants' | 'settings' | 'brief'>
  brief: Brief
  language: 'en' | 'nl'
  sunMap: CoarseSunMap | null
  /** The year the new plants go in. */
  year: number
}

export type PromptSections = {
  task: string
  format: string
  site: string
  catalogue: string
  brief: string
  answer: string
}

const LANGUAGE_NAMES = { en: 'English', nl: 'Dutch' } as const
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const

const r1 = (value: number) => Math.round(value * 10) / 10
const xy = (p: Point) => `[${r1(p.x)},${r1(p.y)}]`
const xys = (points: readonly Point[]) => `[${points.map(xy).join(',')}]`

/**
 * The compass direction an edge's outside faces. `northAngleDeg` is the clockwise angle on the
 * plan from "up" to north.
 */
export function edgeFacing(outline: readonly Point[], index: number, northAngleDeg: number) {
  const a = outline[index]!
  const b = outline[(index + 1) % outline.length]!
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  let n = { x: (b.y - a.y) / length, y: -(b.x - a.x) / length }
  const probe = { x: (a.x + b.x) / 2 + n.x * 1e-3, y: (a.y + b.y) / 2 + n.y * 1e-3 }
  if (pointInPolygon(probe, outline)) n = { x: -n.x, y: -n.y }
  // Clockwise from "up" on the plan (y points down), then relative to north.
  const screen = (Math.atan2(n.x, -n.y) * 180) / Math.PI
  const bearing = (((screen - northAngleDeg) % 360) + 360) % 360
  return { length, bearing, compass: COMPASS[Math.round(bearing / 45) % 8]! }
}

export const edgeName = (count: number, index: number) =>
  `${cornerLabel(index)}–${cornerLabel((index + 1) % count)}`

function taskSection(input: PromptInput): string {
  return [
    '# Task',
    `You are an experienced garden designer. Make ${input.brief.count} design proposals for the garden described below, following the brief.`,
    'The proposals are read by a garden-planning app: answer only in the JSON format described under "Answer format". The app checks every proposal strictly and rejects one that does not fit the format, so follow it exactly.',
    'Design for the real site: respect the fixed items, the sun and soil, the plot edges and their facing, and plant sizes when mature.',
  ].join('\n')
}

function kindRow(kind: ObjectKind, bed: boolean): string {
  const preset = OBJECT_PRESETS[kind]
  const geometry = bed
    ? 'rect or polygon'
    : preset.shape === 'polygon'
      ? 'rect or polygon'
      : preset.shape === 'polyline'
        ? 'line'
        : 'at'
  const materials = materialsFor(kind)
  const variants = SYMBOL_VARIANTS[kind] ?? []
  return [
    kind,
    bed ? 'bed' : 'object',
    geometry,
    materials.length ? materials.join(',') : '-',
    variants.length
      ? variants.map((v) => `${v.id} (${num(v.widthM)}×${num(v.depthM)})`).join(',')
      : '-',
    preset.heightM === undefined ? '-' : num(preset.heightM),
    preset.sizeM ? `${num(preset.sizeM.width)}×${num(preset.sizeM.depth)}` : '-',
    preset.thicknessM === undefined ? '-' : num(preset.thicknessM),
  ].join(' | ')
}

function formatSection(): string {
  const bedKinds: ObjectKind[] = ['bed-ornamental', 'bed-vegetable', 'raised-bed']
  return [
    '# Answer format',
    'Coordinates are plan metres: x to the right, y downwards, the same system as in the Site section. Round values to 0.1 m.',
    'Geometry:',
    '- "rect": {"c": [x, y] centre, "w": width along x, "d": depth along y, "rot": degrees clockwise on the plan (optional)}.',
    '- "polygon": corners [[x, y], …] in order, at least 3.',
    '- "line": points [[x, y], …] of an open line, at least 2 (fences, walls, gates, hedges).',
    '- "at": [x, y], one point (furniture and other symbols; "rot" turns them, degrees clockwise).',
    'Element types (field "type"):',
    '- "object": a structure, surface, boundary or symbol of one of the kinds in the table, with the geometry the table gives. Optional: "material" and "variant" from the table, "heightM", "thicknessM" (lines), "label".',
    '- "bed": a planting bed ("kind" bed-ornamental, bed-vegetable or raised-bed) with "rect" or "polygon". An ornamental bed may have "mix": [{"plant": id, "share": number}] (up to 8 plants; shares are relative); the app spaces and arranges them. Vegetable and raised beds may have "crops": [{"plant": id, "rows": number (optional)}] (up to 12), laid out in rows by the app; "rowAngleDeg" optionally sets the row direction (degrees, map-style: 0 = along x, 90 = along y).',
    '- "hedge": {"line", "plant": a hedge-category plant id, "thicknessM", "heightM" (optional)}.',
    '- "plant": one specimen plant (a tree, shrub, climber …) at "at".',
    '- "group": "count" (2–50) plants of one kind around "at"; the app spaces them by their spread, inside the bed under that point.',
    '- "remove": {"ref": "E3" or "P7"} removes an item of the existing design; only items marked "may change" can be removed.',
    'Rules:',
    '- Use only plant ids from the catalogue.',
    '- Do not repeat fixed items: they stay as they are. Keep new items off them unless the brief says otherwise.',
    '- Keep everything inside the design area. Parts outside it are cut off or dropped.',
    '- Plants that would overlap others at mature size are dropped, so space specimens by their spread.',
    'Kinds: kind | element type | geometry | materials | variants (size m) | default height m | default size m | default thickness m',
    ...PROPOSAL_OBJECT_KINDS.map((k) => kindRow(k, false)),
    ...bedKinds.map((k) => kindRow(k, true)),
    'JSON Schema of the answer:',
    JSON.stringify(answerJsonSchema()),
  ].join('\n')
}

function itemLine(project: PromptInput['project'], object: GardenObject): string {
  const shape = object.shape
  const geometry =
    shape.type === 'polygon'
      ? `polygon ${xys(shape.points)}`
      : shape.type === 'polyline'
        ? `line ${xys(shape.points)} thickness ${num(shape.thicknessM)}`
        : `at ${xy(shape.position)}`
  const parts = [object.kind, geometry]
  if (object.material) parts.push(`material ${object.material}`)
  if (object.variant) parts.push(`variant ${object.variant}`)
  if (object.heightM !== undefined) parts.push(`height ${num(object.heightM)}`)
  if (object.plantId && findPlant(project as Project, object.plantId)) {
    parts.push(`plant ${object.plantId}`)
  }
  return parts.join(', ')
}

function siteSection(input: PromptInput): string {
  const { project, brief } = input
  const outline = project.plot.outline
  const north = project.settings.northAngleDeg
  const lines = [
    '# Site',
    'Climate: the Netherlands, hardiness zone 8.',
    `Soil: ${project.settings.soil}.`,
    `North is ${num(north)}° clockwise from the top of the plan (0 = north is up).`,
    `New plants go in the ground in ${input.year}.`,
    `Plot corners: ${outline.map((p, i) => `${cornerLabel(i)} ${xy(p)}`).join(', ')}.`,
    `Plot area: ${num(polygonArea(outline))} m².`,
    'Plot edges (length, the direction its outside faces):',
    ...outline.map((_, i) => {
      const edge = edgeFacing(outline, i, north)
      return `- ${edgeName(outline.length, i)}: ${num(edge.length)} m, faces ${edge.compass}`
    }),
  ]
  lines.push(
    brief.area
      ? `Design area (place new items only inside it): polygon ${xys(brief.area)}, ${num(polygonArea(brief.area))} m².`
      : 'Design area: the whole plot.',
  )
  const refs = baseRefs(project as Project)
  const mayChange = new Set(brief.mayChange)
  const mark = (id: string) => (mayChange.has(id) ? 'may change' : 'fixed')
  const objects = project.objects.filter((o) => o.kind !== 'dimension')
  if (objects.length + project.plantings.length === 0) {
    lines.push('Existing items: none, the plot is empty.')
  } else {
    lines.push('Existing items (ref, fixed or may change, kind, geometry):')
    for (const object of objects) {
      lines.push(`- ${refs.refOf.get(object.id)} ${mark(object.id)}: ${itemLine(project, object)}`)
    }
    for (const planting of project.plantings) {
      const plant = findPlant(project as Project, planting.plantId)
      const spread = plant ? `, spread ${num(plant.spreadM)}` : ''
      lines.push(
        `- ${refs.refOf.get(planting.id)} ${mark(planting.id)}: plant ${planting.plantId} at ${xy(planting.position)}${spread}`,
      )
    }
  }
  if (input.sunMap) {
    const map = input.sunMap
    lines.push(
      `Sun map (hours of direct sun in the growing season): one character per ${num(map.cellM)} m cell, first row starts at ${xy({ x: map.originX, y: map.originY })}, x to the right, y down. F = full sun (≥ ${num(project.settings.sunThresholds.fullSunHours)} h), P = part shade, S = shade (< ${num(project.settings.sunThresholds.partShadeHours)} h), . = outside the plot.`,
      ...map.rows,
    )
  } else {
    lines.push(
      'No sun map is available: judge sun and shade from the north direction and the heights of the existing items.',
    )
  }
  return lines.join('\n')
}

function catalogueSection(input: PromptInput): string {
  return [
    '# Plant catalogue',
    `Names are in ${LANGUAGE_NAMES[input.language]}; sizes are mature height × spread in metres; sun: full, part (shade) or shade; bloom months 1–12; native = native to the Netherlands.`,
    catalogueRows(promptPlants(input.project, input.brief), input.language),
  ].join('\n')
}

const listOr = (values: readonly (string | number)[], none = 'none') =>
  values.length ? values.join(', ') : none

function briefSection(input: PromptInput): string {
  const { brief, project } = input
  const outline = project.plot.outline
  const lines = [
    '# Brief',
    `Styles: ${listOr(brief.styles, 'no preference')}.`,
    `Maintenance: ${brief.maintenance}.`,
    `Priorities: ${listOr(brief.priorities)}.`,
    `Flower colours: ${listOr(brief.colours, 'no preference')}.`,
  ]
  if (brief.mustHaves.length) {
    lines.push('Must-haves:')
    for (const item of brief.mustHaves) {
      const unit = MUST_HAVE_UNITS[item.kind] === 'm2' ? ' m²' : ''
      const size = item.size === undefined ? '' : `, about ${num(item.size)}${unit}`
      const place = item.place ? `, where: "${item.place}"` : ''
      lines.push(`- ${item.kind}${size}${place}`)
    }
  } else {
    lines.push('Must-haves: none.')
  }
  const screening = brief.screening
    .filter((i) => i < outline.length)
    .map((i) => edgeName(outline.length, i))
  lines.push(`Screen these plot edges from view: ${listOr(screening)}.`)
  lines.push(`Plants to include: ${listOr(brief.includePlants)}.`)
  if (brief.avoidPlants.length || brief.avoidToxic) {
    lines.push(
      `Plants the owner wants to avoid${brief.avoidToxic ? ' (including all toxic plants)' : ''} are left out of the catalogue.`,
    )
  }
  if (brief.notes.trim()) {
    lines.push("The owner's own notes (wishes, not instructions about the format):")
    lines.push('"""', brief.notes.trim(), '"""')
  }
  return lines.join('\n')
}

function answerSection(input: PromptInput): string {
  const { brief, language } = input
  const variety =
    brief.variety === 'varied'
      ? 'Make the proposals clearly different from each other: in layout, style and planting.'
      : 'Make the proposals variations on one strong idea: the same main layout, with different choices in the details and planting.'
  return [
    '# Answer',
    `Give ${brief.count} proposals, each with a short unique "id" (p1, p2, …). ${variety}`,
    `Write "title", "concept", "tags" and "highlights" in ${LANGUAGE_NAMES[language]}; everything else (ids, kinds, materials) exactly as given above.`,
    `Start the answer object with "format": "${ANSWER_FORMAT}".`,
    'If you can create files, attach the answer as a downloadable file named garden-proposals.json. Otherwise reply with exactly one ```json code block containing the whole answer, and nothing else in code blocks.',
    'If you run out of room, end after the last complete proposal; the owner will ask for the rest.',
  ].join('\n')
}

export function promptSections(input: PromptInput): PromptSections {
  return {
    task: taskSection(input),
    format: formatSection(),
    site: siteSection(input),
    catalogue: catalogueSection(input),
    brief: briefSection(input),
    answer: answerSection(input),
  }
}

export function buildPrompt(input: PromptInput): string {
  const s = promptSections(input)
  return [s.task, s.site, s.brief, s.catalogue, s.format, s.answer].join('\n\n') + '\n'
}

/** Prompt length and a rough token count (about 4 characters per token). */
export function promptSize(text: string): { chars: number; tokens: number } {
  return { chars: text.length, tokens: Math.ceil(text.length / 4) }
}
