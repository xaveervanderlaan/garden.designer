import { ABORT_RUN_FAILURES, BridgeError, type BridgeFailure } from './bridgeClient'
import {
  DETAIL_BATCH,
  buildConceptsPrompt,
  buildDetailPrompt,
  buildRetryPrompt,
  bridgeRequestCount,
  parseConcepts,
  type Concept,
} from './bridgePrompts'
import { buildFollowUpPrompt, type FollowUpRequest } from './followUp'
import type { Proposal } from './format'
import { parseAnswer, type AnswerProblem } from './parse'
import type { PromptInput } from './prompt'

/**
 * Runs a generation through the local bridge: concepts first, then details in batches with at most
 * `MAX_IN_FLIGHT` requests at a time. Results are reported as each request finishes. A batch with
 * invalid or missing proposals is asked once more with its problems. Failures that make further
 * requests pointless (see `ABORT_RUN_FAILURES`) and cancelling stop every request.
 */

export const MAX_IN_FLIGHT = 3

/** Sends one prompt and returns Claude's answer text; must stop when `signal` aborts. */
export type GenerateFn = (prompt: string, signal: AbortSignal) => Promise<string>

export type RunEvent =
  | { type: 'concepts'; concepts: Concept[] }
  | { type: 'batch'; proposals: Proposal[]; problems: AnswerProblem[] }
  | { type: 'failed'; ids: string[]; failure: BridgeFailure }
  | { type: 'progress'; done: number; total: number }

type RunOptions = {
  input: PromptInput
  generate: GenerateFn
  signal: AbortSignal
  onEvent: (event: RunEvent) => void
}

function toBridgeError(error: unknown, signal: AbortSignal): BridgeError {
  if (signal.aborted) return new BridgeError('cancelled')
  if (error instanceof BridgeError) return error
  if (error instanceof Error && error.name === 'AbortError') return new BridgeError('cancelled')
  return new BridgeError('badResponse')
}

/** Shared bookkeeping of one run: its own abort controller, progress and the fatal failure. */
class Run {
  readonly controller = new AbortController()
  readonly options: RunOptions
  done = 0
  total: number
  fatal: BridgeError | null = null

  constructor(options: RunOptions, total: number) {
    this.options = options
    this.total = total
    if (options.signal.aborted) this.controller.abort()
    else options.signal.addEventListener('abort', () => this.controller.abort(), { once: true })
  }

  get stopped() {
    return this.controller.signal.aborted
  }

  emit(event: RunEvent) {
    if (!this.stopped) this.options.onEvent(event)
  }

  addRequests(n: number) {
    this.total += n
    this.emit({ type: 'progress', done: this.done, total: this.total })
  }

  /** One request; a fatal failure stops the run, a batch failure is returned. */
  async send(prompt: string): Promise<{ text: string } | { failure: BridgeFailure }> {
    if (this.stopped) throw this.stopError()
    let result: { text: string } | { failure: BridgeFailure }
    try {
      result = { text: await this.options.generate(prompt, this.controller.signal) }
    } catch (error) {
      const failure = toBridgeError(error, this.controller.signal)
      if (failure.failure === 'cancelled' || ABORT_RUN_FAILURES.has(failure.failure)) {
        this.fatal ??= failure
        this.controller.abort()
        throw this.stopError()
      }
      result = { failure: failure.failure }
    }
    this.done++
    this.emit({ type: 'progress', done: this.done, total: this.total })
    return result
  }

  stopError(): BridgeError {
    return this.fatal ?? new BridgeError('cancelled')
  }

  /** Runs tasks with at most `MAX_IN_FLIGHT` at a time; rejects with the run's fatal error. */
  async pool<T>(items: readonly T[], task: (item: T) => Promise<void>, limit = MAX_IN_FLIGHT) {
    const queue = [...items]
    const worker = async () => {
      while (queue.length && !this.stopped) await task(queue.shift()!)
    }
    const results = await Promise.allSettled(
      Array.from({ length: Math.min(limit, queue.length) }, worker),
    )
    if (this.stopped) throw this.stopError()
    const broken = results.find((r) => r.status === 'rejected')
    if (broken) throw broken.reason
  }

  /**
   * Asks for proposals with known ids; retries the invalid and missing ones once. Proposals with
   * other ids are ignored. Returns the ids that never arrived.
   */
  async batch(prompt: string, ids: readonly string[]): Promise<string[]> {
    const first = await this.send(prompt)
    if ('failure' in first) {
      this.emit({ type: 'failed', ids: [...ids], failure: first.failure })
      return [...ids]
    }
    const got = this.read(first.text, ids)
    this.emit({ type: 'batch', proposals: got.proposals, problems: [] })
    if (!got.problems.length && !got.missing.length) return []

    this.addRequests(1)
    const second = await this.send(buildRetryPrompt(prompt, got))
    const pending = [...got.problems.map((p) => p.proposalId!), ...got.missing]
    if ('failure' in second) {
      this.emit({ type: 'batch', proposals: [], problems: got.problems })
      if (got.missing.length) {
        this.emit({ type: 'failed', ids: got.missing, failure: second.failure })
      }
      return got.missing
    }
    const again = this.read(second.text, pending)
    // A proposal still invalid keeps the problems of the retry, else of the first answer.
    const problems = [
      ...again.problems,
      ...got.problems.filter((p) => again.missing.includes(p.proposalId!)),
    ]
    const missing = again.missing.filter((id) => !problems.some((p) => p.proposalId === id))
    this.emit({ type: 'batch', proposals: again.proposals, problems })
    if (missing.length) this.emit({ type: 'failed', ids: missing, failure: 'badResponse' })
    return missing
  }

  /** The valid proposals for `ids` (first of each), the problems of the others and what's missing. */
  read(text: string, ids: readonly string[]) {
    const parsed = parseAnswer(text)
    const proposals: Proposal[] = []
    const problems: AnswerProblem[] = []
    if (parsed.ok) {
      for (const p of parsed.proposals) {
        if (ids.includes(p.id) && !proposals.some((q) => q.id === p.id)) proposals.push(p)
      }
      for (const problem of parsed.problems) {
        const id = problem.proposalId
        if (
          id &&
          ids.includes(id) &&
          !proposals.some((q) => q.id === id) &&
          !problems.some((q) => q.proposalId === id)
        ) {
          problems.push(problem)
        }
      }
    }
    const missing = ids.filter(
      (id) => !proposals.some((p) => p.id === id) && !problems.some((p) => p.proposalId === id),
    )
    return { proposals, problems, missing }
  }
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

async function details(run: Run, concepts: readonly Concept[], all: readonly Concept[]) {
  const failed: string[] = []
  await run.pool(chunks(concepts, DETAIL_BATCH), async (batch) => {
    const prompt = buildDetailPrompt(run.options.input, { batch, all })
    failed.push(
      ...(await run.batch(
        prompt,
        batch.map((c) => c.id),
      )),
    )
  })
  return failed
}

export type RunResult = { concepts: Concept[]; failedIds: string[] }

/** Concepts, then their details. Rejects with a `BridgeError` when the run stops. */
export async function runBridgeGeneration(
  options: RunOptions & { count: number },
): Promise<RunResult> {
  const run = new Run(options, bridgeRequestCount(options.count))
  run.emit({ type: 'progress', done: 0, total: run.total })
  const prompt = buildConceptsPrompt(options.input, options.count)
  let concepts: Concept[] | null = null
  for (let attempt = 0; attempt < 2 && !concepts; attempt++) {
    if (attempt === 1) run.addRequests(1)
    const answer = await run.send(prompt)
    if ('failure' in answer) throw new BridgeError(answer.failure)
    const parsed = parseConcepts(answer.text, options.count)
    if (parsed.ok) concepts = parsed.concepts
  }
  if (!concepts) throw new BridgeError('badResponse')
  // Fewer concepts than asked means fewer detail requests.
  run.total = run.done + Math.ceil(concepts.length / DETAIL_BATCH)
  run.emit({ type: 'concepts', concepts })
  run.emit({ type: 'progress', done: run.done, total: run.total })
  return { concepts, failedIds: await details(run, concepts, concepts) }
}

/** Details for some concepts again (e.g. the ones that failed), with `all` for the titles. */
export async function runBridgeDetails(
  options: RunOptions & { concepts: readonly Concept[]; all: readonly Concept[] },
): Promise<RunResult> {
  const run = new Run(options, Math.ceil(options.concepts.length / DETAIL_BATCH))
  run.emit({ type: 'progress', done: 0, total: run.total })
  return {
    concepts: [...options.concepts],
    failedIds: await details(run, options.concepts, options.all),
  }
}

/**
 * A follow-up through the bridge. "Regenerate" asks for its proposals in batches of
 * `DETAIL_BATCH` (side by side, each retried once); "more like this" asks in batches one after
 * another, so each batch knows the ids already used.
 */
export async function runBridgeFollowUp(
  options: RunOptions & { request: FollowUpRequest },
): Promise<{ failedIds: string[] }> {
  const { request, input } = options
  if (request.kind === 'regenerate') {
    const batches = chunks(request.proposals, DETAIL_BATCH)
    const run = new Run(options, batches.length)
    run.emit({ type: 'progress', done: 0, total: run.total })
    const failedIds: string[] = []
    await run.pool(batches, async (proposals) => {
      const prompt = buildFollowUpPrompt(input, { ...request, proposals })
      failedIds.push(
        ...(await run.batch(
          prompt,
          proposals.map((p) => p.id),
        )),
      )
    })
    return { failedIds }
  }
  const sizes = chunks(Array.from({ length: request.count }), DETAIL_BATCH).map((c) => c.length)
  const run = new Run(options, sizes.length)
  run.emit({ type: 'progress', done: 0, total: run.total })
  const usedIds = [...request.usedIds]
  await run.pool(
    sizes,
    async (count) => {
      const answer = await run.send(buildFollowUpPrompt(input, { ...request, count, usedIds }))
      if ('failure' in answer) {
        run.emit({ type: 'failed', ids: [], failure: answer.failure })
        return
      }
      const parsed = parseAnswer(answer.text)
      if (!parsed.ok) {
        run.emit({ type: 'failed', ids: [], failure: 'badResponse' })
        return
      }
      const proposals = parsed.proposals
        .filter(
          (p, i, list) => !usedIds.includes(p.id) && list.findIndex((q) => q.id === p.id) === i,
        )
        .slice(0, count)
      usedIds.push(...proposals.map((p) => p.id))
      const problems = parsed.problems.filter(
        (p) => !p.proposalId || !usedIds.includes(p.proposalId),
      )
      run.emit({ type: 'batch', proposals, problems })
    },
    1,
  )
  return { failedIds: [] }
}
