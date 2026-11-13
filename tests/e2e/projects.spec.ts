import { readFile, writeFile } from 'node:fs/promises'
import { type Page, expect, test } from '@playwright/test'

function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))
  return errors
}

/** The list row of the design with exactly this name. */
const row = (page: Page, name: string) =>
  page.getByRole('listitem').filter({ has: page.getByRole('link', { name, exact: true }) })

test('design lifecycle: create, edit, rename, duplicate, export, delete, import', async ({
  page,
}, testInfo) => {
  const errors = collectErrors(page)
  await page.goto('./')
  await expect(page.getByText('No designs yet.')).toBeVisible()

  // Create → opens in the editor.
  await page.getByRole('button', { name: 'New design' }).click()
  await page.getByRole('textbox', { name: 'Name of the new design' }).fill('Back garden')
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page).toHaveURL(/#\/p\/[0-9a-f-]+$/)
  const nameField = page.getByRole('textbox', { name: 'Design name' })
  await expect(nameField).toHaveValue('Back garden')

  // Rename in the editor: autosaved, and still there after a reload.
  const saveStatus = page.getByRole('status')
  await nameField.fill('Achtertuin')
  await expect(saveStatus).toHaveText('Unsaved changes')
  await expect(saveStatus).toHaveText('All changes saved')
  await page.reload()
  await expect(nameField).toHaveValue('Achtertuin')

  // Back to the list.
  await page.getByRole('link', { name: 'Back to your designs' }).click()
  await expect(row(page, 'Achtertuin')).toBeVisible()

  // Rename in the list.
  await row(page, 'Achtertuin').getByRole('button', { name: 'Rename' }).click()
  await page.getByRole('textbox', { name: 'New name for “Achtertuin”' }).fill('Voortuin')
  await page.keyboard.press('Enter')
  await expect(row(page, 'Voortuin')).toBeVisible()

  // Duplicate.
  await row(page, 'Voortuin').getByRole('button', { name: 'Duplicate' }).click()
  await expect(row(page, 'Voortuin (copy)')).toBeVisible()
  await expect(page.getByRole('listitem')).toHaveCount(2)

  // Export → a valid .garden.json download.
  const downloading = page.waitForEvent('download')
  await row(page, 'Voortuin').getByRole('button', { name: 'Export' }).click()
  const download = await downloading
  expect(download.suggestedFilename()).toBe('voortuin.garden.json')
  const exportPath = testInfo.outputPath('voortuin.garden.json')
  await download.saveAs(exportPath)
  expect(JSON.parse(await readFile(exportPath, 'utf8'))).toMatchObject({
    format: 'garden-designer',
    schemaVersion: 2,
    project: { name: 'Voortuin', settings: { soil: 'sand' } },
  })

  // Delete, after confirming.
  await row(page, 'Voortuin').getByRole('button', { name: 'Delete' }).click()
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Delete “Voortuin”?' })
    .getByRole('button', { name: 'Delete' })
    .click()
  await expect(page.getByRole('status')).toContainText('Deleted “Voortuin”.')
  await expect(row(page, 'Voortuin')).toHaveCount(0)

  // Import the exported file: the design is back.
  await page.getByTestId('import-input').setInputFiles(exportPath)
  await expect(page.getByRole('status')).toContainText('Imported “Voortuin”.')
  await expect(row(page, 'Voortuin')).toBeVisible()
  await expect(page.getByRole('listitem')).toHaveCount(2)

  // Everything survives a reload.
  await page.reload()
  await expect(row(page, 'Voortuin')).toBeVisible()
  await expect(row(page, 'Voortuin (copy)')).toBeVisible()

  expect(errors).toEqual([])
})

test('explains why a file cannot be imported', async ({ page }, testInfo) => {
  await page.goto('./')
  const notADesign = testInfo.outputPath('notes.json')
  await writeFile(notADesign, JSON.stringify({ hello: 'world' }))

  await page.getByTestId('import-input').setInputFiles(notADesign)

  await expect(page.getByRole('alert')).toHaveText(
    /This file isn’t a Garden Designer design \(\.garden\.json\)\./,
  )
  await expect(page.getByText('No designs yet.')).toBeVisible()
})

test('works in Dutch', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'NL' }).click()

  await page.getByRole('button', { name: 'Nieuw ontwerp' }).click()
  await expect(page.getByRole('textbox', { name: 'Naam van het nieuwe ontwerp' })).toHaveValue(
    'Mijn tuin',
  )
  await page.getByRole('button', { name: 'Aanmaken' }).click()
  await expect(page.getByRole('textbox', { name: 'Naam van het ontwerp' })).toHaveValue('Mijn tuin')
  await expect(page.getByRole('status')).toHaveText('Alle wijzigingen opgeslagen')
})
