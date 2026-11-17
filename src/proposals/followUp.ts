import { ANSWER_FORMAT, type Proposal } from './format'
import { type PromptInput, promptSections } from './prompt'

export type FollowUpRequest =
  | { kind: 'moreLike'; proposal: Proposal; count: number; usedIds: string[] }
  | {
      kind: 'regenerate'
      /** The proposals to redo: they keep their ids. */
      proposals: Proposal[]
      /** The proposals that stay: only their titles are given, so the new ones differ. */
      keep: Proposal[]
    }

const LANGUAGE_NAMES = { en: 'English', nl: 'Dutch' } as const

const ANSWER_FILE_RULES = [
  'If you can create files, attach the answer as a downloadable file named garden-proposals.json. Otherwise reply with exactly one ```json code block containing the whole answer, and nothing else in code blocks.',
  'If you run out of room, end after the last complete proposal; the owner will ask for the rest.',
]

function taskLines(request: FollowUpRequest): string[] {
  if (request.kind === 'moreLike') {
    return [
      '# Task',
      `You are an experienced garden designer. Below is one design proposal the owner likes. Make ${request.count} new variations on it for the garden described below: keep its main idea and layout, but change details such as shapes, materials, plant choices and the position of smaller items.`,
      'The proposals are read by a garden-planning app: answer only in the JSON format described under "Answer format". The app checks every proposal strictly, so follow the format exactly.',
      'The proposal to vary (JSON):',
      JSON.stringify(request.proposal),
    ]
  }
  const keep = request.keep.map((p) => `- ${p.title}`)
  return [
    '# Task',
    `You are an experienced garden designer. Make new versions of ${request.proposals.length} design ${noun(request.proposals.length)} for the garden described below, following the brief. Each new version must be clearly different from the earlier one with the same id.`,
    'The proposals are read by a garden-planning app: answer only in the JSON format described under "Answer format". The app checks every proposal strictly, so follow the format exactly.',
    `Proposals to redo: ${request.proposals.map((p) => `${p.id} ("${p.title}")`).join(', ')}.`,
    ...(keep.length ? ['Proposals the owner keeps (do not repeat their ideas):', ...keep] : []),
  ]
}

function noun(n: number): string {
  return n === 1 ? 'proposal' : 'proposals'
}

function answerLines(input: PromptInput, request: FollowUpRequest): string[] {
  const language = LANGUAGE_NAMES[input.language]
  const ids =
    request.kind === 'moreLike'
      ? `Give ${request.count} ${noun(request.count)}, each with a short unique "id" that is not in this list: ${request.usedIds.join(', ') || 'none'}. Use new ids such as v1, v2, …`
      : `Give ${request.proposals.length} ${noun(request.proposals.length)}, using exactly these ids: ${request.proposals.map((p) => p.id).join(', ')}.`
  return [
    '# Answer',
    ids,
    `Write "title", "concept", "tags" and "highlights" in ${language}; everything else (ids, kinds, materials) exactly as given above.`,
    `Start the answer object with "format": "${ANSWER_FORMAT}".`,
    ...ANSWER_FILE_RULES,
  ]
}

/**
 * A self-contained prompt for a follow-up answer (variations of one proposal, or new versions of
 * some): same site, brief, catalogue and format sections as the first prompt.
 */
export function buildFollowUpPrompt(input: PromptInput, request: FollowUpRequest): string {
  const s = promptSections(input)
  return (
    [
      taskLines(request).join('\n'),
      s.site,
      s.brief,
      s.catalogue,
      s.format,
      answerLines(input, request).join('\n'),
    ].join('\n\n') + '\n'
  )
}
