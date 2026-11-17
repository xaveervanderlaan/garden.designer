import { readFile } from 'node:fs/promises'
import { expect, test, type BrowserContext, type Page, type Route } from '@playwright/test'
import { collectErrors, savedProjects, settled } from './helpers.ts'

/** The local bridge (M21), faked with `context.route`: CI never runs Claude. */

test.use({ serviceWorkers: 'block' })

const SAMPLE = 'tests/e2e/fixtures/sample.garden.json'
const ANSWER = 'tests/e2e/fixtures/sample-answer.md'
const BRIDGE = 'http://127.0.0.1:7387'
const CODE = 'ABCDE-FGHJK'

type Proposal = { id: string; title: string; concept: string; tags: string[]; highlights: string[] }

async function sampleProposals(): Promise<Proposal[]> {
  const text = await readFile(ANSWER, 'utf8')
  const json = /```json\s*([\s\S]*?)```/.exec(text)![1]!
  return (JSON.parse(json) as { proposals: Proposal[] }).proposals
}

function reply(route: Route, origin: string, status: number, body: unknown) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': origin, vary: 'Origin' },
    body: JSON.stringify(body),
  })
}

const HEALTH = {
  app: 'garden-designer-bridge',
  protocol: 1,
  ready: true,
  claudeVersion: '2.1.326 (Claude Code)',
  model: 'sonnet',
  models: ['sonnet', 'opus'],
  maxConcurrent: 3,
}

type Options = { hold?: (ids: string) => boolean; onHeld?: () => void }

/** Routes the bridge address: health, preflights and a fake /generate built from the sample answer. */
async function fakeBridge(context: BrowserContext, origin: string, options: Options = {}) {
  const proposals = await sampleProposals()
  const prompts: string[] = []
  const asked = new Map<string, number>()
  let aborted = 0
  await context.route(`${BRIDGE}/**`, async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': origin,
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'Authorization, Content-Type',
          'access-control-allow-private-network': 'true',
        },
      })
    }
    if (request.headers()['authorization'] !== `Bearer ${CODE.replace('-', '')}`) {
      return reply(route, origin, 401, { error: 'unauthorized' })
    }
    if (request.url().endsWith('/health')) return reply(route, origin, 200, HEALTH)
    const { prompt } = request.postDataJSON() as { prompt: string }
    prompts.push(prompt)
    const text = (body: unknown) =>
      reply(route, origin, 200, {
        text: 'Here you go.\n```json\n' + JSON.stringify(body) + '\n```',
        model: 'sonnet',
        durationMs: 10,
      })
    if (prompt.includes('garden-concepts/1')) {
      const concepts = proposals.map(({ id, title, concept, tags, highlights }) => ({
        id,
        title,
        concept,
        tags,
        highlights,
      }))
      return text({ format: 'garden-concepts/1', concepts })
    }
    const ids = /Ids to answer: (.*)$/m.exec(prompt)![1]!.trim()
    const wanted = ids.split(/,\s*/)
    if (options.hold?.(ids)) {
      options.onHeld?.()
      // Never answered: the page aborts it when cancelling.
      await new Promise<void>((resolve) => context.once('close', () => resolve()))
      aborted++
      return
    }
    const count = (asked.get(ids) ?? 0) + 1
    asked.set(ids, count)
    // The first answer for the first batch leaves one proposal out, which makes the app retry it.
    const give = ids === 'p1, p2, p3' && count === 1 ? wanted.slice(0, -1) : wanted
    return text({
      format: 'garden-proposals/1',
      proposals: proposals.filter((p) => give.includes(p.id)),
    })
  })
  return { prompts, asked, aborted: () => aborted }
}

async function openPromptTab(page: Page) {
  await page.goto('./')
  await page.getByTestId('import-input').setInputFiles(SAMPLE)
  await page.getByRole('link', { name: 'Sample garden' }).click()
  await expect(page.getByTestId('garden-canvas').locator('canvas').first()).toBeVisible()
  await settled(page)
  await page.getByTestId('design-ideas').click()
  const dialog = page.getByRole('dialog', { name: 'Design ideas' })
  await dialog.getByRole('tab', { name: '2. Prompt' }).click()
  return dialog
}

/** Chrome itself logs these for a refused or unauthorised request. */
const browserNoise = (message: string) => !message.startsWith('Failed to load resource')

test('pair and generate 12 proposals through the bridge', async ({ page, context, baseURL }) => {
  const errors = collectErrors(page)
  const origin = new URL(baseURL!).origin
  const requests: string[] = []
  page.on('request', (r) => r.url().startsWith(BRIDGE) && requests.push(r.url()))
  const bridge = await fakeBridge(context, origin)

  const dialog = await openPromptTab(page)
  const panel = dialog.getByTestId('bridge-panel')
  await expect(panel).toBeVisible()
  expect(requests).toEqual([]) // nothing is asked before it is set up

  await panel.getByText('Set up one-click generation').click()
  await panel.getByRole('textbox', { name: 'Pairing code' }).fill(CODE)
  await panel.getByRole('button', { name: 'Pair' }).click()
  await panel.getByRole('button', { name: 'Generate 12 proposals on this computer' }).click()

  await expect(dialog.getByTestId('bridge-status')).toContainText('Finished', { timeout: 30_000 })
  await expect(dialog.getByTestId('proposal')).toHaveCount(12)

  // 1 concepts request, 4 detail batches, plus one retry for the batch that missed a proposal.
  expect(bridge.prompts.filter((p) => p.includes('garden-concepts/1')).length).toBeGreaterThan(0)
  expect(bridge.asked.get('p1, p2, p3')).toBe(1)
  expect(bridge.asked.get('p3')).toBe(1)
  const stored = await page.evaluate(() => localStorage.getItem('garden-designer.bridge'))
  expect(JSON.parse(stored!)).toMatchObject({ address: BRIDGE })

  await dialog
    .getByRole('button', { name: /Use this design/ })
    .first()
    .click()
  await expect(page).toHaveURL(/#\/p\/(?!$)/)
  await expect.poll(async () => (await savedProjects(page)).length, { timeout: 10_000 }).toBe(2)
  expect(errors.filter(browserNoise)).toEqual([])
})

test('shows when the bridge is not running', async ({ page, context }) => {
  const errors = collectErrors(page)
  await context.route(`${BRIDGE}/**`, (route) => route.abort('connectionrefused'))
  await page.addInitScript(
    ([address, code]) =>
      localStorage.setItem(
        'garden-designer.bridge',
        JSON.stringify({ address, code, model: 'sonnet' }),
      ),
    [BRIDGE, CODE.replace('-', '')],
  )
  const dialog = await openPromptTab(page)
  await expect(dialog.getByTestId('bridge-panel')).toContainText(/does not answer/)
  await expect(dialog.getByRole('button', { name: /on this computer/ })).toHaveCount(0)
  expect(errors.filter(browserNoise)).toEqual([])
})

test('cancel stops the run', async ({ page, context, baseURL }) => {
  const errors = collectErrors(page)
  const origin = new URL(baseURL!).origin
  let held = 0
  await fakeBridge(context, origin, {
    hold: (ids) => ids.startsWith('p4,'),
    onHeld: () => held++,
  })
  await page.addInitScript(
    ([address, code]) =>
      localStorage.setItem(
        'garden-designer.bridge',
        JSON.stringify({ address, code, model: 'sonnet' }),
      ),
    [BRIDGE, CODE.replace('-', '')],
  )
  const dialog = await openPromptTab(page)
  await dialog.getByRole('button', { name: 'Generate 12 proposals on this computer' }).click()
  await expect.poll(() => held, { timeout: 15_000 }).toBeGreaterThan(0)
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog.getByTestId('bridge-status')).toContainText('cancelled')
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toHaveCount(0)
  expect(errors.filter(browserNoise)).toEqual([])
})
