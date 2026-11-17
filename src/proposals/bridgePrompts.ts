import type { z } from 'zod'
import { ANSWER_FORMAT, proposalSchema } from './format'
import { salvage, type AnswerProblem, type IssueCode } from './parse'
import { promptSections, type PromptInput } from './prompt'

/**
 * Prompts for generating through the local bridge: first one request for short concepts, then the
 * full proposals a few concepts at a time. Every prompt starts with the same text (task, site,
 * brief, catalogue, format) and differs only in its last section, so Claude's prompt cache helps.
 */

export const CONCEPTS_FORMAT = 'garden-concepts/1'
/** Concepts worked out per detail request. */
export const DETAIL_BATCH = 3

export const conceptSchema = proposalSchema.pick({
  id: true,
  title: true,
  concept: true,
  tags: true,
  highlights: true,
})
export type Concept = z.infer<typeof conceptSchema>

/** The concept as Claude writes it: its id is replaced by the app's own. */
const rawConceptSchema = conceptSchema.omit({ id: true })

const LANGUAGE_NAMES = { en: 'English', nl: 'Dutch' } as const

/** Requests needed for `count` proposals: one for the concepts, then one per batch. */
export function bridgeRequestCount(count: number): number {
  return 1 + Math.ceil(count / DETAIL_BATCH)
}

function bridgeTask(): string {
  return [
    '# Task',
    'You are an experienced garden designer, working for a garden-planning app on the garden described below and following its brief.',
    'The work is done in steps: first a list of short design concepts, then complete proposals for a few concepts at a time. The "Answer" section at the end says which step this is.',
    'The app reads your answer as JSON and checks every proposal strictly against the format under "Answer format"; a proposal that does not fit is rejected, so follow it exactly.',
    'Design for the real site: respect the fixed items, the sun and soil, the plot edges and their facing, and plant sizes when mature.',
  ].join('\n')
}

/** The shared beginning of every bridge prompt. */
export function bridgePrefix(input: PromptInput): string {
  const s = promptSections(input)
  return [bridgeTask(), s.site, s.brief, s.catalogue, s.format].join('\n\n')
}

function varietyLine(input: PromptInput): string {
  return input.brief.variety === 'varied'
    ? 'The concepts must differ clearly from each other: in layout, style and planting.'
    : 'The concepts are variations on one strong idea: the same main layout, with different choices in the details and planting.'
}

export function buildConceptsPrompt(input: PromptInput, count: number): string {
  const language = LANGUAGE_NAMES[input.language]
  return (
    [
      bridgePrefix(input),
      [
        '# Answer',
        `This step: concepts only, no elements yet. Give ${count} design concepts for this garden. ${varietyLine(input)}`,
        'Each concept has "id" (c1, c2, …), "title" (at most 80 characters), "concept" (the idea in a few sentences, at most 800 characters), "tags" (at most 8 short words) and "highlights" (at most 6 short points: its main features).',
        `Write "title", "concept", "tags" and "highlights" in ${language}.`,
        `Reply with exactly one \`\`\`json code block containing { "format": "${CONCEPTS_FORMAT}", "concepts": [ … ] }, and nothing else in code blocks.`,
      ].join('\n'),
    ].join('\n\n') + '\n'
  )
}

const IDS_LINE = 'Ids to answer: '

export function buildDetailPrompt(
  input: PromptInput,
  concepts: { batch: readonly Concept[]; all: readonly Concept[] },
): string {
  const language = LANGUAGE_NAMES[input.language]
  const ids = concepts.batch.map((c) => c.id)
  const others = concepts.all.filter((c) => !ids.includes(c.id))
  return (
    [
      bridgePrefix(input),
      [
        '# Answer',
        `This step: complete proposals for ${ids.length === 1 ? 'one concept' : `${ids.length} concepts`}. Work out each concept below as a full proposal with elements; keep its id, title and idea.`,
        ...concepts.batch.map((c) => JSON.stringify(c)),
        ...(others.length
          ? [
              'The other concepts are worked out separately; keep yours clearly different from them:',
              ...others.map((c) => `- ${c.id}: ${c.title}`),
            ]
          : []),
        `Write "title", "concept", "tags" and "highlights" in ${language}; everything else (ids, kinds, materials) exactly as given above.`,
        `Start the answer object with "format": "${ANSWER_FORMAT}". Reply with exactly one \`\`\`json code block containing the whole answer, and nothing else in code blocks.`,
        IDS_LINE + ids.join(', '),
      ].join('\n'),
    ].join('\n\n') + '\n'
  )
}

/** Short English hints per issue, for the corrections sent with a retry. */
export const ISSUE_HINTS: Record<IssueCode, string> = {
  required: 'a required field is missing',
  type: 'a value has the wrong type',
  range: 'a number, list or text is outside its allowed range or length',
  enum: 'a value is not one of the allowed values',
  geometry: 'the shape is not one this kind allows (give exactly one of the listed geometries)',
  material: 'this material is not allowed for this kind',
  variant: 'this variant is not allowed for this kind',
  mix: 'a planting mix or crop list is used on the wrong kind of bed',
  other: 'the value does not fit the format',
}

/**
 * The same request again, asking only for the ids that were invalid or missing, with what was wrong.
 * The earlier answer itself is never repeated.
 */
export function buildRetryPrompt(
  prompt: string,
  retry: { problems: readonly AnswerProblem[]; missing: readonly string[] },
): string {
  const body = prompt.replace(/\n?Ids to answer: [^\n]*\n?$/, '').trimEnd()
  const lines = [
    '# Corrections',
    'Your previous answer to this step could not be used completely. Answer again only for the ids below, each as a whole proposal, with these problems fixed:',
  ]
  const ids: string[] = []
  for (const problem of retry.problems) {
    const id = problem.proposalId ?? `proposal ${problem.index + 1}`
    if (problem.proposalId && !ids.includes(problem.proposalId)) ids.push(problem.proposalId)
    for (const issue of problem.issues) {
      lines.push(`- ${id}, ${issue.path || 'proposal'}: ${ISSUE_HINTS[issue.code]}`)
    }
  }
  for (const id of retry.missing) {
    lines.push(`- ${id}: missing from the answer`)
    if (!ids.includes(id)) ids.push(id)
  }
  return [body, lines.join('\n') + '\n' + IDS_LINE + ids.join(', ')].join('\n\n') + '\n'
}

export type ParsedConcepts =
  { ok: true; concepts: Concept[] } | { ok: false; error: 'noJson' | 'invalid' }

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

function conceptCandidates(text: string): string[] {
  const fences = [...text.matchAll(/```(?:json)?[^\S\n]*\n([\s\S]*?)```/gi)].map((m) => m[1]!)
  const open = text.match(/```(?:json)?[^\S\n]*\n(?![\s\S]*```)([\s\S]*)$/i)
  if (open) fences.push(open[1]!)
  const out = fences.filter((f) => f.includes('"concepts"'))
  const brace = text.indexOf('{')
  if (brace >= 0) out.push(text.slice(brace))
  return out
}

function tryJson(text: string): unknown {
  try {
    return JSON.parse(text.trim())
  } catch {
    const end = text.lastIndexOf('}')
    try {
      return end >= 0 ? JSON.parse(text.slice(0, end + 1)) : undefined
    } catch {
      return undefined
    }
  }
}

/**
 * Reads the concepts answer (fenced or bare JSON; a cut-off list keeps its complete items), keeps
 * at most `count` valid concepts and numbers them p1, p2, … in order.
 */
export function parseConcepts(text: string, count: number): ParsedConcepts {
  let sawJson = false
  for (const option of conceptCandidates(text)) {
    const parsed = tryJson(option)
    let list: unknown[] | undefined
    if (parsed !== undefined) {
      sawJson = true
      const value = isRecord(parsed) ? parsed.concepts : parsed
      if (Array.isArray(value)) list = value
    } else {
      const salvaged = salvage(option, 'concepts')
      if (salvaged.length) {
        sawJson = true
        list = salvaged
      }
    }
    if (!list) continue
    const concepts = list
      .map((item) => rawConceptSchema.safeParse(item))
      .filter((r) => r.success)
      .slice(0, count)
      .map((r, i): Concept => ({ id: `p${i + 1}`, ...r.data }))
    return concepts.length ? { ok: true, concepts } : { ok: false, error: 'invalid' }
  }
  return { ok: false, error: sawJson ? 'invalid' : 'noJson' }
}
