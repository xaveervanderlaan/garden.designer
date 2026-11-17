import type { ProposalSetRecord } from '../../../../persistence/proposalSets'
import { saveProposalSet } from '../../../../persistence/proposalSets'
import { BridgeError, createBridgeClient } from '../../../../proposals/bridgeClient'
import type { Concept } from '../../../../proposals/bridgePrompts'
import {
  type GenerateFn,
  type RunEvent,
  runBridgeDetails,
  runBridgeFollowUp,
  runBridgeGeneration,
} from '../../../../proposals/bridgeRun'
import type { Proposal } from '../../../../proposals/format'
import type { FollowUpRequest } from '../../../../proposals/followUp'
import type { AnswerProblem } from '../../../../proposals/parse'
import type { PromptInput } from '../../../../proposals/prompt'
import {
  type ConceptProgress,
  setBridgeRunAbort,
  useBridgeRunStore,
} from '../../../../store/bridgeRunStore'
import { addAnswerToSet, nowMs } from '../proposalSet'
import type { BridgeSettings } from './bridgeSettings'

/**
 * Starting, following and stopping generations through the local bridge (M21). Each first
 * generation makes a new proposal set; follow-ups add to the set they came from. Proposals are
 * added and saved per batch, so cards appear as they arrive.
 */

type SetBase = { projectId: string; updatedAt: number; requested: number }

let current: { id: number; controller: AbortController } | null = null
let runCounter = 0
/** What "Retry missing" needs from the last first generation. */
let lastGeneration: {
  input: PromptInput
  all: Concept[]
  settings: BridgeSettings
  base: SetBase
} | null = null
/** Saves one after another, so an older version never overwrites a newer one. */
let saving: Promise<void> = Promise.resolve()

const set = useBridgeRunStore.setState
const get = useBridgeRunStore.getState

function enqueueSave(record: ProposalSetRecord) {
  saving = saving
    .then(() => saveProposalSet(record))
    .catch((error: unknown) => console.warn('Saving the proposals failed', error))
}

/** Saves a changed run set (stars, discards) in turn with the run's own saves. */
export function saveRunSet(record: ProposalSetRecord) {
  if (get().set?.id !== record.id) return
  set({ set: record })
  enqueueSave(record)
}

function markConcepts(ids: readonly string[], state: ConceptProgress['state']) {
  if (ids.length === 0) return
  const wanted = new Set(ids)
  set((s) => ({
    concepts: s.concepts.map((c) => (wanted.has(c.id) ? { ...c, state } : c)),
  }))
}

const IDS_LINE = /^Ids to answer: (.*)$/m

function generateFor(settings: BridgeSettings, runId: number): GenerateFn {
  const client = createBridgeClient({ address: settings.address, code: settings.code })
  return async (prompt, signal) => {
    const ids = IDS_LINE.exec(prompt)?.[1]?.split(/,\s*/)
    if (ids && current?.id === runId) markConcepts(ids, 'working')
    const response = await client.generate({ prompt, model: settings.model }, signal)
    return response.text
  }
}

function addBatch(proposals: Proposal[], problems: AnswerProblem[], base: SetBase) {
  const next = addAnswerToSet(
    get().set,
    { ok: true, proposals, problems, truncated: false },
    base,
    nowMs(),
  )
  set((s) => ({ set: next, ready: s.ready + proposals.length }))
  enqueueSave(next)
  markConcepts(
    proposals.map((p) => p.id),
    'ready',
  )
  markConcepts(
    problems.map((p) => p.proposalId).filter((id): id is string => !!id),
    'failed',
  )
}

function begin(
  state: Pick<
    ReturnType<typeof get>,
    'kind' | 'phase' | 'concepts' | 'projectId' | 'set' | 'ready' | 'wanted'
  >,
) {
  current?.controller.abort()
  const controller = new AbortController()
  const id = ++runCounter
  current = { id, controller }
  setBridgeRunAbort(() => controller.abort())
  set({
    ...state,
    status: 'running',
    failure: null,
    detail: undefined,
    failedIds: [],
  })
  return { id, signal: controller.signal }
}

function handler(id: number, base: SetBase, onConcepts?: (concepts: Concept[]) => void) {
  return (event: RunEvent) => {
    if (current?.id !== id) return
    switch (event.type) {
      case 'concepts':
        onConcepts?.(event.concepts)
        set({
          phase: 'details',
          wanted: event.concepts.length,
          concepts: event.concepts.map((c) => ({ id: c.id, title: c.title, state: 'waiting' })),
        })
        break
      case 'batch':
        addBatch(event.proposals, event.problems, base)
        break
      case 'failed':
        markConcepts(event.ids, 'failed')
        set({ failure: event.failure })
        break
    }
  }
}

function end(id: number) {
  if (current?.id !== id) return false
  current = null
  setBridgeRunAbort(null)
  return true
}

/** Concepts that have no valid proposal yet. */
const missing = () =>
  get()
    .concepts.filter((c) => c.state !== 'ready')
    .map((c) => c.id)

/** After a stop: unfinished concepts failed, or (cancelled) back to waiting. */
function stopConcepts(cancelled: boolean) {
  set((s) => ({
    concepts: s.concepts.map((c) =>
      c.state === 'ready' ? c : { ...c, state: cancelled ? 'waiting' : 'failed' },
    ),
  }))
}

function follow(id: number, run: Promise<unknown>) {
  run.then(
    () => {
      if (!end(id)) return
      stopConcepts(false)
      set({ status: 'done', phase: null, failedIds: missing() })
    },
    (error: unknown) => {
      if (!end(id)) return
      const e = error instanceof BridgeError ? error : new BridgeError('badResponse')
      if (e.failure !== 'cancelled') console.warn('Generating through the bridge failed', e)
      stopConcepts(e.failure === 'cancelled')
      set({
        status: e.failure === 'cancelled' ? 'cancelled' : 'failed',
        phase: null,
        failure: e.failure === 'cancelled' ? null : e.failure,
        detail: e.detail,
        failedIds: missing(),
      })
    },
  )
}

/** A first generation: concepts, then their details, into a new set. */
export function startBridgeRun(options: {
  input: PromptInput
  base: { projectId: string; updatedAt: number }
  count: number
  settings: BridgeSettings
}) {
  const base = { ...options.base, requested: options.count }
  const generation = {
    input: options.input,
    all: [] as Concept[],
    settings: options.settings,
    base,
  }
  lastGeneration = generation
  const { id, signal } = begin({
    kind: 'generate',
    phase: 'concepts',
    concepts: [],
    projectId: base.projectId,
    set: null,
    ready: 0,
    wanted: options.count,
  })
  const run = runBridgeGeneration({
    input: options.input,
    count: options.count,
    generate: generateFor(options.settings, id),
    signal,
    onEvent: handler(id, base, (concepts) => {
      generation.all = concepts
    }),
  })
  follow(id, run)
}

/** Asks again for the proposals of the last generation that did not arrive. */
export function retryMissing() {
  const state = get()
  const generation = lastGeneration
  if (!generation || state.kind !== 'generate' || state.status === 'running') return
  const failed = new Set(state.failedIds)
  const concepts = generation.all.filter((c) => failed.has(c.id))
  if (concepts.length === 0) return
  const { id, signal } = begin({
    kind: 'generate',
    phase: 'details',
    concepts: state.concepts.map((c) => (failed.has(c.id) ? { ...c, state: 'waiting' } : c)),
    projectId: state.projectId,
    set: state.set,
    ready: state.concepts.filter((c) => c.state === 'ready').length,
    wanted: state.concepts.length,
  })
  const run = runBridgeDetails({
    input: generation.input,
    concepts,
    all: generation.all,
    generate: generateFor(generation.settings, id),
    signal,
    onEvent: handler(id, generation.base),
  })
  follow(id, run)
}

/** "More like this" or "Regenerate" through the bridge, into the set they came from. */
export function startBridgeFollowUp(options: {
  input: PromptInput
  request: FollowUpRequest
  set: ProposalSetRecord
  settings: BridgeSettings
}) {
  const { request, set: record } = options
  const base = {
    projectId: record.projectId,
    updatedAt: record.baseUpdatedAt,
    requested: record.requested,
  }
  const { id, signal } = begin({
    kind: 'followUp',
    phase: 'details',
    concepts:
      request.kind === 'regenerate'
        ? request.proposals.map((p) => ({ id: p.id, title: p.title, state: 'working' }))
        : [],
    projectId: record.projectId,
    set: record,
    ready: 0,
    wanted: request.kind === 'regenerate' ? request.proposals.length : request.count,
  })
  const run = runBridgeFollowUp({
    input: options.input,
    request,
    generate: generateFor(options.settings, id),
    signal,
    onEvent: handler(id, base),
  })
  follow(id, run)
}

/** Stops the running generation; the bridge stops Claude when its requests are aborted. */
export function cancelBridgeRun() {
  const running = current
  if (!running) return
  end(running.id)
  running.controller.abort()
  stopConcepts(true)
  set({ status: 'cancelled', phase: null, failedIds: missing() })
}
