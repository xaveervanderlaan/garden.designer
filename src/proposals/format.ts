import { z } from 'zod'
import { OBJECT_PRESETS, SYMBOL_VARIANTS, materialsFor } from '../model/objectKinds'
import { OBJECT_KINDS, type ObjectKind } from '../model/schema'

/**
 * The answer format Claude is asked to produce. Coordinates are plan metres (x to the right, y
 * downwards, as stored). Unknown keys are stripped, not rejected; an invalid proposal is rejected
 * as a whole. Custom issue messages are issue codes (see parse.ts).
 */
export const ANSWER_FORMAT = 'garden-proposals/1'

const coord = z.number().min(-10_000).max(10_000)
const length = z.number().positive().max(10_000)
const xy = z.tuple([coord, coord])

export const rectSchema = z.object({ c: xy, w: length, d: length, rot: z.number().optional() })
const polygon = z.array(xy).min(3).max(200)
const line = z.array(xy).min(2).max(200)

const excluded: readonly ObjectKind[] = [
  'house',
  'dimension',
  'hedge',
  'bed-ornamental',
  'bed-vegetable',
  'raised-bed',
]
export const PROPOSAL_OBJECT_KINDS = OBJECT_KINDS.filter((k) => !excluded.includes(k))

const plantRef = z.string().min(1).max(100)

const objectElement = z
  .object({
    type: z.literal('object'),
    kind: z.enum(PROPOSAL_OBJECT_KINDS as [ObjectKind, ...ObjectKind[]]),
    rect: rectSchema.optional(),
    polygon: polygon.optional(),
    line: line.optional(),
    at: xy.optional(),
    thicknessM: length.optional(),
    rot: z.number().optional(),
    material: z.string().max(50).optional(),
    variant: z.string().max(50).optional(),
    heightM: length.optional(),
    label: z.string().max(200).optional(),
  })
  .superRefine((el, ctx) => {
    const shape = OBJECT_PRESETS[el.kind].shape
    const given = [el.rect, el.polygon, el.line, el.at].filter((v) => v !== undefined).length
    const fits =
      given === 1 &&
      (shape === 'polygon'
        ? el.rect !== undefined || el.polygon !== undefined
        : shape === 'polyline'
          ? el.line !== undefined
          : el.at !== undefined)
    if (!fits) ctx.addIssue({ code: 'custom', message: 'geometry', path: [] })
    if (
      el.material !== undefined &&
      !(materialsFor(el.kind) as readonly string[]).includes(el.material)
    ) {
      ctx.addIssue({ code: 'custom', message: 'material', path: ['material'] })
    }
    if (
      el.variant !== undefined &&
      !(SYMBOL_VARIANTS[el.kind] ?? []).some((v) => v.id === el.variant)
    ) {
      ctx.addIssue({ code: 'custom', message: 'variant', path: ['variant'] })
    }
  })

const bedElement = z
  .object({
    type: z.literal('bed'),
    kind: z.enum(['bed-ornamental', 'bed-vegetable', 'raised-bed']),
    rect: rectSchema.optional(),
    polygon: polygon.optional(),
    mix: z
      .array(z.object({ plant: plantRef, share: z.number().positive() }))
      .max(8)
      .optional(),
    crops: z
      .array(z.object({ plant: plantRef, rows: z.number().int().min(1).max(50).optional() }))
      .max(12)
      .optional(),
    rowAngleDeg: z.number().optional(),
    label: z.string().max(200).optional(),
  })
  .superRefine((el, ctx) => {
    if ((el.rect === undefined) === (el.polygon === undefined)) {
      ctx.addIssue({ code: 'custom', message: 'geometry', path: [] })
    }
    if (el.mix !== undefined && el.kind !== 'bed-ornamental') {
      ctx.addIssue({ code: 'custom', message: 'mix', path: ['mix'] })
    }
    if (el.crops !== undefined && el.kind === 'bed-ornamental') {
      ctx.addIssue({ code: 'custom', message: 'mix', path: ['crops'] })
    }
  })

const hedgeElement = z.object({
  type: z.literal('hedge'),
  line,
  plant: plantRef,
  thicknessM: length.optional(),
  heightM: length.optional(),
})
const plantElement = z.object({ type: z.literal('plant'), plant: plantRef, at: xy })
const groupElement = z.object({
  type: z.literal('group'),
  plant: plantRef,
  at: xy,
  count: z.number().int().min(2).max(50),
})
const removeElement = z.object({ type: z.literal('remove'), ref: z.string().regex(/^[EP]\d+$/) })

export const elementSchema = z.discriminatedUnion('type', [
  objectElement,
  bedElement,
  hedgeElement,
  plantElement,
  groupElement,
  removeElement,
])
export type ProposalElement = z.infer<typeof elementSchema>

export const proposalSchema = z.object({
  id: z.string().min(1).max(20),
  title: z.string().max(80),
  concept: z.string().max(800),
  tags: z.array(z.string().max(30)).max(8),
  highlights: z.array(z.string().max(150)).max(6),
  elements: z.array(elementSchema).min(1).max(500),
})
export type Proposal = z.infer<typeof proposalSchema>

export const answerSchema = z.object({
  format: z.literal(ANSWER_FORMAT).optional(),
  proposals: z.array(proposalSchema),
})
export type Answer = z.infer<typeof answerSchema>

let jsonSchema: unknown
/** JSON Schema of the answer, for the prompt. Materials are listed per kind there. */
export function answerJsonSchema(): unknown {
  jsonSchema ??= z.toJSONSchema(answerSchema, { io: 'input', unrepresentable: 'any' })
  return jsonSchema
}
