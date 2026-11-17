import { describe, expect, it, vi } from 'vitest'
import { defaultBrief } from '../model/brief'
import { BridgeError } from './bridgeClient'
import type { Concept } from './bridgePrompts'
import {
  runBridgeDetails,
  runBridgeFollowUp,
  runBridgeGeneration,
  type GenerateFn,
  type RunEvent,
} from './bridgeRun'
import { proposalSchema, type Proposal } from './format'
import type { PromptInput } from './prompt'
import { emptyPlot } from './testProject'

function input(): PromptInput {
  return { project: emptyPlot(), brief: defaultBrief(), language: 'en', sunMap: null, year: 2027 }
}

const proposal = (id: string, extra: object = {}) => ({
  id,
  title: `Title ${id}`,
  concept: 'C',
  tags: [],
  highlights: [],
  elements: [{ type: 'object', kind: 'terrace', rect: { c: [5, 5], w: 3, d: 3 } }],
  ...extra,
})
const invalid = (id: string) => proposal(id, { elements: [] })
const fenced = (value: unknown) => '```json\n' + JSON.stringify(value) + '\n```\n'
const answer = (items: object[]) => fenced({ format: 'garden-proposals/1', proposals: items })
const conceptsAnswer = (n: number) =>
  fenced({
    format: 'garden-concepts/1',
    concepts: Array.from({ length: n }, (_, i) => ({
      id: `c${i + 1}`,
      title: `Idea ${i + 1}`,
      concept: 'An idea',
      tags: [],
      highlights: [],
    })),
  })
const idsOf = (prompt: string) =>
  prompt.match(/Ids to answer: ([^\n]*)\n?$/)?.[1]?.split(', ') ?? []
const isConcepts = (prompt: string) => prompt.includes('"concepts": [')
const tick = () => new Promise((resolve) => setTimeout(resolve, 1))

type Handler = (prompt: string) => string | Promise<string>
const defaultHandler: Handler = async (prompt) => {
  await tick()
  return isConcepts(prompt) ? conceptsAnswer(12) : answer(idsOf(prompt).map((id) => proposal(id)))
}

/** A stand-in for the bridge client that counts requests in flight and honours the signal. */
function fakeBridge(handler: Handler = defaultHandler) {
  const state = { inFlight: 0, max: 0, prompts: [] as string[] }
  const generate: GenerateFn = (prompt, signal) =>
    new Promise((resolve, reject) => {
      let settled = false
      const settle = (fn: () => void) => {
        if (settled) return
        settled = true
        state.inFlight--
        fn()
      }
      state.prompts.push(prompt)
      state.inFlight++
      state.max = Math.max(state.max, state.inFlight)
      signal.addEventListener('abort', () => settle(() => reject(new BridgeError('cancelled'))))
      Promise.resolve()
        .then(() => handler(prompt))
        .then(
          (text) => settle(() => resolve(text)),
          (error: unknown) => settle(() => reject(error)),
        )
    })
  return { state, generate }
}

function collect() {
  const events: RunEvent[] = []
  const of = <T extends RunEvent['type']>(type: T) =>
    events.filter((e): e is Extract<RunEvent, { type: T }> => e.type === type)
  const proposals = () => of('batch').flatMap((e) => e.proposals.map((p: Proposal) => p.id))
  return { events, onEvent: (e: RunEvent) => events.push(e), of, proposals }
}

const ids = (n: number, from = 1) => Array.from({ length: n }, (_, i) => `p${i + from}`)

describe('runBridgeGeneration', () => {
  it('asks for concepts, then details 3 at a time', async () => {
    const bridge = fakeBridge()
    const log = collect()
    const result = await runBridgeGeneration({
      input: input(),
      count: 12,
      generate: bridge.generate,
      signal: new AbortController().signal,
      onEvent: log.onEvent,
    })
    expect(bridge.state.prompts).toHaveLength(5)
    expect(isConcepts(bridge.state.prompts[0]!)).toBe(true)
    expect(bridge.state.prompts.slice(1).map(idsOf)).toEqual([
      ids(3),
      ids(3, 4),
      ids(3, 7),
      ids(3, 10),
    ])
    expect(log.of('concepts')[0]!.concepts.map((c) => c.id)).toEqual(ids(12))
    expect(log.proposals().sort()).toEqual(ids(12).sort())
    expect(log.of('progress').at(-1)).toEqual({ type: 'progress', done: 5, total: 5 })
    expect(result.failedIds).toEqual([])
    expect(log.of('failed')).toEqual([])
  })

  it('never has more than 3 requests running', async () => {
    const bridge = fakeBridge(async (prompt) => {
      await tick()
      await tick()
      return isConcepts(prompt)
        ? conceptsAnswer(15)
        : answer(idsOf(prompt).map((id) => proposal(id)))
    })
    const log = collect()
    await runBridgeGeneration({
      input: input(),
      count: 15,
      generate: bridge.generate,
      signal: new AbortController().signal,
      onEvent: log.onEvent,
    })
    expect(bridge.state.max).toBe(3)
    expect(log.proposals()).toHaveLength(15)
  })

  it('retries an invalid batch once with its problems', async () => {
    let first = true
    const bridge = fakeBridge(async (prompt) => {
      const want = idsOf(prompt)
      if (want[0] === 'p1' && first) {
        first = false
        // p2 is invalid, p3 missing, and a stray id is ignored.
        return answer([proposal('p1'), invalid('p2'), proposal('zz')])
      }
      return defaultHandler(prompt)
    })
    const log = collect()
    const result = await runBridgeGeneration({
      input: input(),
      count: 12,
      generate: bridge.generate,
      signal: new AbortController().signal,
      onEvent: log.onEvent,
    })
    const retry = bridge.state.prompts.find((p) => p.includes('# Corrections'))!
    expect(retry).toContain('- p2, elements: ')
    expect(retry).toContain('- p3: missing from the answer')
    expect(idsOf(retry)).toEqual(['p2', 'p3'])
    expect(bridge.state.prompts).toHaveLength(6)
    expect(log.proposals().sort()).toEqual(ids(12).sort())
    expect(log.proposals()).not.toContain('zz')
    expect(log.of('progress').at(-1)).toEqual({ type: 'progress', done: 6, total: 6 })
    expect(result.failedIds).toEqual([])
  })

  it('reports a batch that stays invalid', async () => {
    const bridge = fakeBridge(async (prompt) =>
      idsOf(prompt)[0] === 'p1' || idsOf(prompt)[0] === 'p2'
        ? answer([proposal('p1'), invalid('p2')])
        : defaultHandler(prompt),
    )
    const log = collect()
    const result = await runBridgeGeneration({
      input: input(),
      count: 6,
      generate: bridge.generate,
      signal: new AbortController().signal,
      onEvent: log.onEvent,
    })
    expect(bridge.state.prompts.filter((p) => p.includes('# Corrections'))).toHaveLength(1)
    const problems = log.of('batch').flatMap((e) => e.problems)
    expect(problems.map((p) => p.proposalId)).toEqual(['p2'])
    expect(log.of('failed')).toEqual([{ type: 'failed', ids: ['p3'], failure: 'badResponse' }])
    expect(result.failedIds).toEqual(['p3'])
    expect(log.proposals().sort()).toEqual(['p1', 'p4', 'p5', 'p6'])
  })

  it('a failed batch does not stop the others', async () => {
    const bridge = fakeBridge(async (prompt) => {
      if (idsOf(prompt)[0] === 'p4') throw new BridgeError('timeout')
      return defaultHandler(prompt)
    })
    const log = collect()
    const result = await runBridgeGeneration({
      input: input(),
      count: 9,
      generate: bridge.generate,
      signal: new AbortController().signal,
      onEvent: log.onEvent,
    })
    expect(log.of('failed')).toEqual([{ type: 'failed', ids: ids(3, 4), failure: 'timeout' }])
    expect(result.failedIds).toEqual(ids(3, 4))
    expect(log.proposals().sort()).toEqual([...ids(3), ...ids(3, 7)].sort())
  })

  it('stops everything on cancel', async () => {
    const bridge = fakeBridge((prompt) =>
      isConcepts(prompt) ? conceptsAnswer(12) : new Promise<string>(() => {}),
    )
    const controller = new AbortController()
    const log = collect()
    const run = runBridgeGeneration({
      input: input(),
      count: 12,
      generate: bridge.generate,
      signal: controller.signal,
      onEvent: log.onEvent,
    })
    await vi.waitFor(() => expect(bridge.state.inFlight).toBe(3))
    const before = log.events.length
    controller.abort()
    await expect(run).rejects.toMatchObject({ failure: 'cancelled' })
    expect(bridge.state.inFlight).toBe(0)
    expect(bridge.state.prompts).toHaveLength(4)
    expect(log.events).toHaveLength(before)
  })

  it('stops on usage limit', async () => {
    const bridge = fakeBridge(async (prompt) => {
      if (isConcepts(prompt)) return conceptsAnswer(12)
      if (idsOf(prompt)[0] === 'p1') {
        await tick()
        throw new BridgeError('usageLimit', 'You hit your limit')
      }
      return new Promise<string>(() => {})
    })
    const log = collect()
    const run = runBridgeGeneration({
      input: input(),
      count: 12,
      generate: bridge.generate,
      signal: new AbortController().signal,
      onEvent: log.onEvent,
    })
    await expect(run).rejects.toMatchObject({ failure: 'usageLimit', detail: 'You hit your limit' })
    expect(bridge.state.inFlight).toBe(0)
    // The fourth batch never started.
    expect(bridge.state.prompts).toHaveLength(4)
    expect(log.of('failed')).toEqual([])
  })
})

describe('runBridgeDetails', () => {
  it('retries missing details', async () => {
    const all: Concept[] = ids(6).map((id) => ({
      id,
      title: `Idea ${id}`,
      concept: 'C',
      tags: [],
      highlights: [],
    }))
    const bridge = fakeBridge()
    const log = collect()
    const result = await runBridgeDetails({
      input: input(),
      concepts: all.slice(3, 5),
      all,
      generate: bridge.generate,
      signal: new AbortController().signal,
      onEvent: log.onEvent,
    })
    expect(bridge.state.prompts.map(idsOf)).toEqual([['p4', 'p5']])
    expect(bridge.state.prompts[0]).toContain('- p1: Idea p1')
    expect(log.proposals()).toEqual(['p4', 'p5'])
    expect(result.failedIds).toEqual([])
  })
})

describe('runBridgeFollowUp', () => {
  it('more like this runs batches one after another', async () => {
    let next = 1
    const bridge = fakeBridge(async (prompt) => {
      await tick()
      const count = Number(prompt.match(/Give (\d+) proposals?, each/)![1])
      return answer(Array.from({ length: count }, () => proposal(`v${next++}`)))
    })
    const log = collect()
    const liked = proposalSchema.parse(proposal('p1'))
    await runBridgeFollowUp({
      input: input(),
      request: { kind: 'moreLike', proposal: liked, count: 7, usedIds: ['p1'] },
      generate: bridge.generate,
      signal: new AbortController().signal,
      onEvent: log.onEvent,
    })
    expect(bridge.state.max).toBe(1)
    expect(bridge.state.prompts).toHaveLength(3)
    expect(bridge.state.prompts[1]).toContain('not in this list: p1, v1, v2, v3.')
    expect(bridge.state.prompts[2]).toMatch(/Give 1 proposal, each/)
    expect(log.proposals()).toEqual(['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7'])
  })

  it('regenerate asks 3 at a time with fixed ids', async () => {
    const bridge = fakeBridge(async (prompt) => {
      await tick()
      const want = prompt.match(/using exactly these ids: ([^\n.]*)\./)![1]!.split(', ')
      return answer(want.map((id) => proposal(id)))
    })
    const log = collect()
    const proposals = ids(4).map((id) => proposalSchema.parse(proposal(id)))
    await runBridgeFollowUp({
      input: input(),
      request: { kind: 'regenerate', proposals, keep: [] },
      generate: bridge.generate,
      signal: new AbortController().signal,
      onEvent: log.onEvent,
    })
    expect(bridge.state.prompts).toHaveLength(2)
    expect(log.proposals().sort()).toEqual(ids(4))
  })
})
