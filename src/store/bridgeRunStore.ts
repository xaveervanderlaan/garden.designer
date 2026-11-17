import { create } from 'zustand'
import type { ProposalSetRecord } from '../persistence/proposalSets'
import type { BridgeFailure } from '../proposals/bridgeClient'

/**
 * A generation through the local bridge (M21): view state, never saved or undone, kept while the
 * Design ideas dialog switches tabs or closes, and stopped when a design opens.
 */
export type BridgeRunStatus = 'idle' | 'running' | 'done' | 'failed' | 'cancelled'

export type ConceptProgress = {
  id: string
  title: string
  state: 'waiting' | 'working' | 'ready' | 'failed'
}

export type BridgeRunState = {
  status: BridgeRunStatus
  /** A first generation (concepts, then details) or a follow-up on an existing set. */
  kind: 'generate' | 'followUp' | null
  phase: 'concepts' | 'details' | null
  concepts: ConceptProgress[]
  /** Requests finished and planned. */
  done: number
  total: number
  /** What stopped the run, or what made the last failed batch fail. */
  failure: BridgeFailure | null
  detail?: string
  /** Proposals that did not arrive (for "Retry missing"). */
  failedIds: string[]
  projectId: string | null
  /** The set the proposals go into. */
  set: ProposalSetRecord | null
}

const initial: BridgeRunState = {
  status: 'idle',
  kind: null,
  phase: null,
  concepts: [],
  done: 0,
  total: 0,
  failure: null,
  failedIds: [],
  projectId: null,
  set: null,
}

export const useBridgeRunStore = create<BridgeRunState>(() => ({ ...initial }))

let abortRunning: (() => void) | null = null

/** bridgeActions registers how to stop a running generation, so resetting can abort it. */
export function setBridgeRunAbort(abort: (() => void) | null) {
  abortRunning = abort
}

/** Back to no run; a running one is aborted. */
export function resetBridgeRun() {
  const abort = abortRunning
  abortRunning = null
  abort?.()
  useBridgeRunStore.setState({ ...initial }, true)
}
