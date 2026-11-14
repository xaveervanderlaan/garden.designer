import { type Page, expect, test } from '@playwright/test'

function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()))
  page.on('pageerror', (err) => errors.push(err.message))
  return errors
}

async function newDesign(page: Page, name: string) {
  await page.goto('./')
  await page.getByRole('button', { name: 'New design' }).click()
  await page.getByRole('textbox', { name: 'Name of the new design' }).fill(name)
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByRole('textbox', { name: 'Design name' })).toHaveValue(name)
}

test.describe('plant library', () => {
  test('searching “lavendel” finds Lavandula, with its details', async ({ page }) => {
    const errors = collectErrors(page)
    await newDesign(page, 'Library')

    const search = page.getByRole('searchbox', { name: 'Search plants' })
    await search.fill('lavendel')
    const results = page.getByRole('list', { name: 'Plants' })
    const first = results.getByRole('button').first()
    await expect(first).toContainText('Lavandula angustifolia')

    await first.click()
    await expect(page.getByRole('heading', { name: 'English lavender' })).toBeVisible()
    await expect(page.getByText('Unverified')).toBeVisible()
    await expect(page.getByTestId('soil-suitability')).toHaveText('Suits your soil (sand).')

    // Filters narrow the list; the count follows.
    await page.getByRole('button', { name: 'Back to the list' }).click()
    await search.fill('')
    const count = page.getByTestId('library-count')
    const all = Number((await count.textContent())!.replace(/\D/g, ''))
    await page.getByRole('button', { name: 'Bulbs' }).click()
    await page.getByRole('button', { name: 'Filters' }).click()
    await page.getByRole('button', { name: 'February' }).click()
    await expect(results).toContainText('Snowdrop')
    const bulbs = Number((await count.textContent())!.replace(/\D/g, ''))
    expect(bulbs).toBeGreaterThan(0)
    expect(bulbs).toBeLessThan(all)

    expect(errors).toEqual([])
  })

  test('creates a custom plant that is saved with the design', async ({ page }) => {
    const errors = collectErrors(page)
    await newDesign(page, 'Own plants')

    await page.getByRole('button', { name: 'New plant' }).click()
    const dialog = page.getByRole('dialog', { name: 'New plant' })
    await dialog.getByLabel('Dutch name').fill('Oma’s hortensia')
    await dialog.getByLabel('Latin name').fill('Hydrangea macrophylla')
    await dialog.getByLabel('Type').selectOption({ label: 'Shrub' })
    await dialog.getByLabel('Height (m)').fill('1,2')
    await dialog.getByLabel('Width (m)').fill('1,4')
    await dialog.getByRole('checkbox', { name: 'Part shade' }).check()
    await dialog.getByRole('button', { name: 'Blue', exact: true }).click()
    await dialog.getByRole('button', { name: 'July' }).click()
    await dialog.getByRole('button', { name: 'Add plant' }).click()
    await expect(dialog).toBeHidden()

    await expect(page.getByRole('heading', { name: 'Oma’s hortensia' })).toBeVisible()
    await expect(page.getByText('1.20 m high, 1.40 m wide')).toBeVisible()

    // Autosaved: still there after a reload, under "Own plants".
    await expect(page.getByRole('status')).toHaveText('All changes saved')
    await page.reload()
    await page.getByRole('button', { name: 'Own plants' }).click()
    await expect(page.getByRole('list', { name: 'Plants' })).toContainText('Oma’s hortensia')

    expect(errors).toEqual([])
  })
})
