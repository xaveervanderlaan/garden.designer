import { readFile } from 'node:fs/promises'
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { collectErrors, savedProjects, settled } from './helpers.ts'

/** Design ideas (M19): brief, prompt, pasted answer and a new design. */

const SAMPLE = 'tests/e2e/fixtures/sample.garden.json'
const ANSWER = 'tests/e2e/fixtures/sample-answer.md'

test('brief, prompt, answer and a new design', async ({ page, context, baseURL }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const errors = collectErrors(page)
  const origin = new URL(baseURL!).origin
  const outside: string[] = []
  page.on('request', (request) => {
    const url = request.url()
    if (!url.startsWith(origin) && !url.startsWith('data:') && !url.startsWith('blob:')) {
      outside.push(url)
    }
  })

  await page.goto('./')
  await page.getByTestId('import-input').setInputFiles(SAMPLE)
  await page.getByRole('link', { name: 'Sample garden' }).click()
  await expect(page.getByTestId('garden-canvas').locator('canvas').first()).toBeVisible()
  await settled(page)

  await page.getByTestId('design-ideas').click()
  const dialog = page.getByRole('dialog', { name: 'Design ideas' })
  await dialog.getByRole('checkbox', { name: 'Natural' }).check()
  await dialog.getByRole('button', { name: 'Save brief' }).click()

  await dialog.getByRole('tab', { name: '2. Prompt' }).click()
  const prompt = dialog.getByTestId('ideas-prompt')
  const promptText = await prompt.inputValue()
  expect(promptText.length).toBeGreaterThan(1000)
  expect(promptText).not.toContain('Sample garden')
  expect(promptText).not.toContain('52.13')
  expect(promptText).not.toContain('5.29')

  await dialog.getByRole('button', { name: 'Copy prompt' }).click()
  await expect(dialog.getByRole('status').filter({ hasText: 'Copied' })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(promptText)

  await dialog.getByRole('tab', { name: '3. Proposals' }).click()
  await dialog
    .getByRole('textbox', { name: "Paste Claude's answer" })
    .fill(await readFile(ANSWER, 'utf8'))
  await dialog.getByRole('button', { name: 'Read answer' }).click()
  await expect(dialog.getByTestId('answer-status')).toContainText('12 of 12 proposals')
  await expect(dialog.getByTestId('proposal')).toHaveCount(12)
  await expect(dialog.getByTestId('answer-problems')).toHaveCount(0)

  await dialog
    .getByRole('button', { name: /Use this design/ })
    .first()
    .click()
  await expect(page).toHaveURL(/#\/p\/(?!$)/)
  await expect(page.getByTestId('garden-canvas').locator('canvas').first()).toBeVisible()

  await expect.poll(async () => (await savedProjects(page)).length, { timeout: 10_000 }).toBe(2)
  const projects = await savedProjects(page)
  const original = projects.find((p) => p.name === 'Sample garden')!
  const copy = projects.find((p) => p.name.startsWith('Sample garden — '))!
  expect(copy).toBeTruthy()
  const objects = (p: unknown) => (p as { objects: { status: string }[] }).objects
  const plantings = (p: unknown) => (p as { plantings: unknown[] }).plantings
  expect(objects(copy).length).toBeGreaterThan(objects(original).length)
  expect(plantings(copy).length).toBeGreaterThan(plantings(original).length)
  expect(objects(copy).some((o) => o.status === 'new')).toBe(true)

  expect(outside).toEqual([])
  expect(errors).toEqual([])
})

/** Opens the sample garden's design ideas with a brief that has a checklist and reads the answer. */
async function openGallery(page: Page, context: BrowserContext) {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('./')
  await page.getByTestId('import-input').setInputFiles(SAMPLE)
  await page.getByRole('link', { name: 'Sample garden' }).click()
  await expect(page.getByTestId('garden-canvas').locator('canvas').first()).toBeVisible()
  await settled(page)
  await page.getByTestId('design-ideas').click()
  const dialog = page.getByRole('dialog', { name: 'Design ideas' })
  await dialog
    .getByRole('group', { name: 'Screen off along these plot edges' })
    .getByRole('checkbox')
    .first()
    .check()
  await dialog.getByRole('button', { name: 'Save brief' }).click()
  await dialog.getByRole('tab', { name: '3. Proposals' }).click()
  await dialog
    .getByRole('textbox', { name: "Paste Claude's answer" })
    .fill(await readFile(ANSWER, 'utf8'))
  await dialog.getByRole('button', { name: 'Read answer' }).click()
  const first = dialog.getByTestId('proposal').first()
  await expect(first).toBeVisible()
  return dialog
}

function watchOutside(page: Page, baseURL: string) {
  const origin = new URL(baseURL).origin
  const outside: string[] = []
  page.on('request', (request) => {
    const url = request.url()
    if (!url.startsWith(origin) && !url.startsWith('data:') && !url.startsWith('blob:')) {
      outside.push(url)
    }
  })
  return outside
}

test('gallery: thumbnails, star, preview and use', async ({ page, context, baseURL }) => {
  const errors = collectErrors(page)
  const outside = watchOutside(page, baseURL!)
  const dialog = await openGallery(page, context)

  const ready = dialog.locator('[data-testid="proposal-thumb"][data-ready="true"]')
  await expect(ready).toHaveCount(12, { timeout: process.env.CI ? 4000 : 2000 })
  await expect(dialog.getByTestId('proposal-figures').first()).toBeVisible()
  await expect(dialog.getByTestId('proposal-checklist').first()).toBeVisible()

  const title = await dialog
    .getByTestId('proposal')
    .first()
    .getByRole('heading')
    .first()
    .innerText()
  await dialog.getByRole('button', { name: `Star ${title}`, exact: true }).click()
  await dialog.getByRole('checkbox', { name: 'Starred only' }).check()
  await expect(dialog.getByTestId('proposal')).toHaveCount(1)
  await dialog.getByRole('checkbox', { name: 'Starred only' }).uncheck()
  await expect(dialog.getByTestId('proposal')).toHaveCount(12)

  await dialog.getByRole('button', { name: `Preview ${title}`, exact: true }).click()
  const preview = page.getByTestId('proposal-preview')
  await expect(preview).toBeVisible()
  await expect(preview.getByTestId('preview-position')).toContainText('1')
  await preview.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(preview.getByTestId('preview-position')).toContainText('2')
  await page.keyboard.press('Escape')
  await expect(preview).toHaveCount(0)
  await expect(dialog).toBeVisible()

  await dialog.getByRole('button', { name: `Preview ${title}`, exact: true }).click()
  await page
    .getByTestId('proposal-preview')
    .getByRole('button', { name: /^Use this design/ })
    .click()
  await expect(page).toHaveURL(/#\/p\/(?!$)/)
  await expect.poll(async () => (await savedProjects(page)).length, { timeout: 10_000 }).toBe(2)

  expect(outside).toEqual([])
  expect(errors).toEqual([])
})

test('use several and more like this', async ({ page, context, baseURL }) => {
  const errors = collectErrors(page)
  const outside = watchOutside(page, baseURL!)
  const dialog = await openGallery(page, context)

  const cards = dialog.getByTestId('proposal')
  const titles: string[] = []
  for (const i of [0, 1]) {
    const title = await cards.nth(i).getByRole('heading').first().innerText()
    titles.push(title)
    await dialog.getByRole('checkbox', { name: `Select ${title}`, exact: true }).check()
  }
  await dialog.getByRole('button', { name: `More like ${titles[0]}`, exact: true }).click()
  const followUp = dialog.getByTestId('followup')
  await expect(followUp).toBeVisible()
  await followUp.getByRole('button', { name: 'Copy prompt' }).click()
  const copied = await page.evaluate(() => navigator.clipboard.readText())
  expect(copied).toContain('not in this list:')
  expect(copied).toBe(await followUp.getByTestId('followup-prompt').inputValue())
  await followUp.getByRole('button', { name: 'Close the follow-up prompt' }).click()

  await dialog.getByRole('button', { name: 'Use selected (2)' }).click()
  await expect(page).toHaveURL(/#\/$/)
  await expect.poll(async () => (await savedProjects(page)).length, { timeout: 10_000 }).toBe(3)

  await page
    .getByRole('link', { name: /^Sample garden — / })
    .first()
    .click()
  await expect(page.getByTestId('garden-canvas').locator('canvas').first()).toBeVisible()
  expect(outside).toEqual([])
  expect(errors).toEqual([])
})
