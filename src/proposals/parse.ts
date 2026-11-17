import type { z } from 'zod'
import { ANSWER_FORMAT, proposalSchema, type Proposal } from './format'

export const MAX_ANSWER_CHARS = 5_000_000

export const ISSUE_CODES = [
  'required',
  'type',
  'range',
  'enum',
  'geometry',
  'material',
  'variant',
  'mix',
  'other',
] as const
export type IssueCode = (typeof ISSUE_CODES)[number]

export type AnswerIssue = { code: IssueCode; path: string }
export type AnswerProblem = {
  index: number
  proposalId?: string
  title?: string
  issues: AnswerIssue[]
}

export type ParsedAnswer =
  | { ok: true; proposals: Proposal[]; problems: AnswerProblem[]; truncated: boolean }
  | { ok: false; error: 'empty' | 'noJson' | 'notProposals' | 'tooLarge' }

const CUSTOM_CODES: readonly IssueCode[] = ['geometry', 'material', 'variant', 'mix']

function toIssue(issue: z.core.$ZodIssue): AnswerIssue {
  const path = issue.path.map(String).join('.')
  let code: IssueCode = 'other'
  if (issue.code === 'invalid_type') {
    code = issue.message.endsWith('received undefined') ? 'required' : 'type'
  } else if (issue.code === 'too_big' || issue.code === 'too_small') code = 'range'
  else if (issue.code === 'invalid_value') code = 'enum'
  else if (issue.code === 'custom') {
    code = CUSTOM_CODES.find((c) => c === issue.message) ?? 'other'
  }
  return { code, path }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Candidate JSON texts: fenced blocks that mention proposals first, else from the first brace. */
function candidates(text: string): string[] {
  const fences = [...text.matchAll(/```(?:json)?[^\S\n]*\n([\s\S]*?)```/gi)].map((m) => m[1]!)
  // An unterminated final fence (truncated answer) still counts.
  const open = text.match(/```(?:json)?[^\S\n]*\n(?![\s\S]*```)([\s\S]*)$/i)
  if (open) fences.push(open[1]!)
  const withProposals = fences.filter((f) => f.includes('"proposals"'))
  const out = [...withProposals]
  const brace = text.indexOf('{')
  if (brace >= 0) out.push(text.slice(brace))
  return out
}

/** Splits the complete top-level objects of the `"<key>": [` array of a damaged answer. */
export function salvage(text: string, key = 'proposals'): unknown[] {
  const at = text.search(new RegExp(`"${key}"\\s*:\\s*\\[`))
  if (at < 0) return []
  let i = text.indexOf('[', at) + 1
  const found: unknown[] = []
  let depth = 0
  let start = -1
  let inString = false
  for (; i < text.length; i++) {
    const ch = text[i]!
    if (inString) {
      if (ch === '\\') i++
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{' || ch === '[') {
      if (depth === 0 && ch === '{') start = i
      depth++
    } else if (ch === '}' || ch === ']') {
      depth--
      if (depth === 0 && start >= 0) {
        try {
          found.push(JSON.parse(text.slice(start, i + 1)))
        } catch {
          // an unreadable piece is skipped
        }
        start = -1
      }
      if (depth < 0) break
    }
  }
  return found
}

function checkProposals(raw: unknown[]): { proposals: Proposal[]; problems: AnswerProblem[] } {
  const proposals: Proposal[] = []
  const problems: AnswerProblem[] = []
  raw.forEach((item, index) => {
    const result = proposalSchema.safeParse(item)
    if (result.success) {
      proposals.push(result.data)
      return
    }
    const record = isRecord(item) ? item : {}
    problems.push({
      index,
      ...(typeof record.id === 'string' ? { proposalId: record.id } : {}),
      ...(typeof record.title === 'string' ? { title: record.title } : {}),
      issues: result.error.issues.slice(0, 3).map(toIssue),
    })
  })
  return { proposals, problems }
}

export function parseAnswer(text: string): ParsedAnswer {
  if (text.length > MAX_ANSWER_CHARS) return { ok: false, error: 'tooLarge' }
  if (text.trim() === '') return { ok: false, error: 'empty' }
  const options = candidates(text)
  if (options.length === 0) return { ok: false, error: 'noJson' }

  let sawJson = false
  for (const option of options) {
    let parsed: unknown
    try {
      parsed = JSON.parse(option.trim())
    } catch {
      // Prose may follow a bare answer: try the text up to its last closing brace.
      const end = option.lastIndexOf('}')
      try {
        parsed = end >= 0 ? JSON.parse(option.slice(0, end + 1)) : undefined
      } catch {
        parsed = undefined
      }
    }
    if (parsed !== undefined) {
      sawJson = true
      const list = isRecord(parsed) ? parsed.proposals : Array.isArray(parsed) ? parsed : undefined
      if (!Array.isArray(list)) continue
      if (isRecord(parsed) && parsed.format !== undefined && parsed.format !== ANSWER_FORMAT) {
        return { ok: false, error: 'notProposals' }
      }
      return { ok: true, truncated: false, ...checkProposals(list) }
    }
    const salvaged = salvage(option)
    if (salvaged.length > 0) return { ok: true, truncated: true, ...checkProposals(salvaged) }
  }
  return { ok: false, error: sawJson ? 'notProposals' : 'noJson' }
}

/** Merges by proposal id: a later proposal replaces an earlier one; order of first appearance. */
export function mergeProposals(prev: Proposal[], next: Proposal[]): Proposal[] {
  const merged = new Map<string, Proposal>()
  for (const p of prev) merged.set(p.id, p)
  for (const p of next) merged.set(p.id, p)
  return [...merged.values()]
}

/** A follow-up prompt asking for the proposals that are missing or were rejected. */
export function buildContinuePrompt(input: {
  received: string[]
  invalid: string[]
  requested: number
  language: 'en' | 'nl'
}): string {
  const { received, invalid, requested, language } = input
  const missing = requested - received.length
  const lines = [
    `Please continue with the same design brief, using the same answer format ("${ANSWER_FORMAT}").`,
    received.length > 0
      ? `Already received and valid: ${received.join(', ')}. Do not repeat these.`
      : 'Nothing valid has been received yet.',
    invalid.length > 0
      ? `These proposals were rejected and must be sent again, corrected: ${invalid.join(', ')}.`
      : '',
    missing > 0
      ? `${missing} more proposal${missing === 1 ? ' is' : 's are'} still needed to reach ${requested} in total; use new ids.`
      : '',
    'Keep each answer short enough to finish: complete proposals only, in one ```json block or an attached garden-proposals.json.',
    `Write titles, concepts, tags and highlights in ${language === 'nl' ? 'Dutch' : 'English'}.`,
  ]
  return lines.filter(Boolean).join('\n')
}
