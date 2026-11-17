import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
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
