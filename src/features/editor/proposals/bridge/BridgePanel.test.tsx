import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../../../i18n'
import { defaultBrief } from '../../../../model/brief'
import { db } from '../../../../persistence/db'
import { listProposalSets } from '../../../../persistence/proposalSets'
import { BRIDGE_APP, type HealthResponse } from '../../../../proposals/bridgeProtocol'
import { useProjectStore } from '../../../../store/projectStore'
import { useUiStore } from '../../../../store/uiStore'
import { sampleProjectWithAsset } from '../../../../test/fixtures'
import { DesignIdeasDialog } from '../DesignIdeasDialog'
import { loadBridgeSettings, saveBridgeSettings } from './bridgeSettings'

// jsdom has no canvas: thumbnails are covered by the e2e tests.
vi.mock('../thumbnails', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../thumbnails')>()),
  useThumbnail: () => null,
}))

const HEALTH: HealthResponse = {
  app: BRIDGE_APP,
  protocol: 1,
  ready: true,
  claudeVersion: '2.1.326',
  model: 'sonnet',
  models: ['sonnet', 'opus'],
  maxConcurrent: 3,
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const reply = (text: string) => json(200, { text, model: 'sonnet', durationMs: 1 })
const fenced = (value: unknown) => '```json\n' + JSON.stringify(value) + '\n```\n'

const terrace = { type: 'object', kind: 'terrace', rect: { c: [15, 10], w: 4, d: 3 } }
const idsOf = (prompt: string) => /^Ids to answer: (.*)$/m.exec(prompt)![1]!.split(/,\s*/)
const isConcepts = (prompt: string) => prompt.includes('garden-concepts/1')

function conceptsAnswer(count: number) {
  return reply(
    fenced({
      format: 'garden-concepts/1',
      concepts: Array.from({ length: count }, (_, i) => ({
        id: `p${i + 1}`,
        title: `Idea ${i + 1}`,
        concept: 'A calm idea.',
        tags: ['calm'],
        highlights: [],
      })),
    }),
  )
}

function detailsAnswer(prompt: string) {
  const proposals = idsOf(prompt).map((id) => ({
    id,
    title: `Idea ${id.slice(1)}`,
    concept: 'A calm idea.',
    tags: ['calm'],
    highlights: [],
    elements: [terrace],
  }))
  return reply(fenced({ format: 'garden-proposals/1', proposals }))
}

type Handler = (prompt: string, signal: AbortSignal) => Response | Promise<Response>

/** A fake bridge behind `fetch`; health is ready unless `health` says otherwise. */
function stubBridge(handle: Handler, health: unknown = HEALTH) {
  const fetchFn = vi.fn<typeof fetch>(async (input, init) => {
    if (String(input).endsWith('/health')) return json(200, health)
    const body = JSON.parse(String(init?.body)) as { prompt: string }
    return handle(body.prompt, init!.signal!)
  })
  vi.stubGlobal('fetch', fetchFn)
  return fetchFn
}

/** A response held until `release`; rejects like fetch when its signal aborts. */
function held(signal: AbortSignal, response: () => Response) {
  let release!: () => void
  const promise = new Promise<Response>((resolve, reject) => {
    release = () => resolve(response())
    signal.addEventListener('abort', () =>
      reject(new DOMException('The operation was aborted.', 'AbortError')),
    )
  })
  return { promise, release, signal }
}

const pair = () =>
  saveBridgeSettings({ address: 'http://127.0.0.1:7387', code: 'ABCDEFGHJK', model: 'sonnet' })

async function openDialog(tab: 'prompt' | 'proposals' = 'prompt', count = 6) {
  const { project: sample, asset } = sampleProjectWithAsset()
  sample.brief = { ...defaultBrief(), count }
  await db.projects.add(sample)
  await db.assets.add(asset)
  await act(async () => {
    await useProjectStore.getState().open(sample.id)
    useUiStore.getState().setIdeasOpen(true, tab)
  })
  render(<DesignIdeasDialog />)
  return sample.id
}

describe('BridgePanel', () => {
  beforeEach(() => {
    useUiStore.getState().reset()
  })

  afterEach(async () => {
    useUiStore.getState().reset()
    await useProjectStore.getState().close()
    vi.unstubAllGlobals()
    await act(() => i18n.changeLanguage('en'))
  })

  it('makes no request until set up', async () => {
    const fetchFn = stubBridge(() => reply(''))
    await openDialog()
    expect(screen.getByText('Set up one-click generation')).toBeInTheDocument()
    await act(() => new Promise((r) => setTimeout(r, 50)))
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('pairs with a code', async () => {
    const user = userEvent.setup()
    const fetchFn = stubBridge(() => reply(''))
    await openDialog()
    await user.click(screen.getByText('Set up one-click generation'))
    await user.type(screen.getByRole('textbox', { name: 'Pairing code' }), 'abcde-fghjk')
    await user.click(screen.getByRole('button', { name: 'Pair' }))
    expect(
      await screen.findByRole('button', { name: 'Generate 6 proposals on this computer' }),
    ).toBeInTheDocument()
    expect(loadBridgeSettings()).toEqual({
      address: 'http://127.0.0.1:7387',
      code: 'ABCDEFGHJK',
      model: 'sonnet',
    })
    const [url, init] = fetchFn.mock.calls[0]!
    expect(url).toBe('http://127.0.0.1:7387/health')
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer ABCDEFGHJK' })
    expect(screen.getByText(/Connected to Claude Code 2\.1\.326/)).toBeInTheDocument()
    expect(screen.getByText(/about 3 requests/)).toBeInTheDocument()
  })

  it('shows not logged in', async () => {
    pair()
    stubBridge(() => reply(''), { ...HEALTH, ready: false, reason: 'notLoggedIn' })
    await openDialog()
    expect(await screen.findByRole('alert')).toHaveTextContent('Claude Code is not logged in')
    expect(screen.queryByRole('button', { name: /Generate/ })).not.toBeInTheDocument()
  })

  it('generates and shows cards as batches arrive', async () => {
    const user = userEvent.setup()
    pair()
    const details: ReturnType<typeof held>[] = []
    const fetchFn = stubBridge((prompt, signal) => {
      if (isConcepts(prompt)) return conceptsAnswer(6)
      const h = held(signal, () => detailsAnswer(prompt))
      details.push(h)
      return h.promise
    })
    const projectId = await openDialog()
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Model' }), 'opus')
    await user.click(screen.getByRole('button', { name: 'Generate 6 proposals on this computer' }))

    // The dialog moves to the Proposals tab and lists the concepts while their details come in.
    const progress = await screen.findByTestId('bridge-progress')
    await waitFor(() => expect(details).toHaveLength(2))
    expect(within(progress).getAllByRole('listitem')).toHaveLength(6)
    expect(within(progress).getByRole('status')).toHaveTextContent(
      'Working out the proposals… 0 of 6 ready',
    )

    await act(async () => details[0]!.release())
    await waitFor(() => expect(screen.getAllByTestId('proposal')).toHaveLength(3))
    expect(within(progress).getByRole('status')).toHaveTextContent('3 of 6 ready')
    await act(async () => details[1]!.release())
    await waitFor(() => expect(screen.getAllByTestId('proposal')).toHaveLength(6))
    expect(within(progress).getByRole('status')).toHaveTextContent('Finished: 6 proposals.')

    const bodies = fetchFn.mock.calls
      .filter(([url]) => String(url).endsWith('/generate'))
      .map(([, init]) => JSON.parse(String(init?.body)) as { model: string })
    expect(bodies.map((b) => b.model)).toEqual(['opus', 'opus', 'opus'])
    await waitFor(async () => {
      const [saved] = await listProposalSets(projectId)
      expect(saved?.proposals).toHaveLength(6)
    })
  })

  it('cancel stops the run', async () => {
    const user = userEvent.setup()
    pair()
    const requests: ReturnType<typeof held>[] = []
    stubBridge((_prompt, signal) => {
      const h = held(signal, () => conceptsAnswer(6))
      requests.push(h)
      return h.promise
    })
    await openDialog()
    await user.click(
      await screen.findByRole('button', { name: 'Generate 6 proposals on this computer' }),
    )
    const progress = await screen.findByTestId('bridge-progress')
    expect(within(progress).getByRole('status')).toHaveTextContent('Asking Claude for ideas')
    await waitFor(() => expect(requests).toHaveLength(1))
    await user.click(within(progress).getByRole('button', { name: 'Cancel' }))
    expect(within(progress).getByRole('status')).toHaveTextContent('Generating was cancelled.')
    expect(requests[0]!.signal.aborted).toBe(true)
    expect(within(progress).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the usage limit message in Dutch', async () => {
    const user = userEvent.setup()
    await act(() => i18n.changeLanguage('nl'))
    pair()
    stubBridge(() => json(503, { error: 'usageLimit' }))
    await openDialog()
    await user.click(
      await screen.findByRole('button', { name: '6 voorstellen genereren op deze computer' }),
    )
    const progress = await screen.findByTestId('bridge-progress')
    expect(await within(progress).findByRole('alert')).toHaveTextContent(
      'De gebruikslimiet van je Claude-abonnement is bereikt',
    )
  })
})
