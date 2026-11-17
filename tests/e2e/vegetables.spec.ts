import { expect, test } from '@playwright/test'
import { collectErrors, fitted, openPlant } from './helpers.ts'

const PLOT = { minX: 0, minY: 0, maxX: 20, maxY: 15 }

const count = async (page: import('@playwright/test').Page, testId: string) =>
  Number((await page.getByTestId(testId).textContent())!.replace(/\D/g, ''))

test('plants three crops in rows and reads the calendar', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('./')
  await page.getByRole('button', { name: 'New design' }).click()
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByTestId('garden-canvas').locator('canvas').first()).toBeVisible()

  // A 20 × 15 m plot.
  await page.keyboard.press('r')
  const rectangle = page.getByRole('dialog', { name: 'Rectangular plot' })
  await rectangle.getByLabel('Width (m)').fill('20')
  await rectangle.getByLabel('Depth (m)').fill('15')
  await rectangle.getByRole('button', { name: 'Create' }).click()

  // A 4 × 2 m vegetable bed from (2, 2), with typed lengths.
  await page.getByRole('toolbar').getByRole('button', { name: 'Draw vegetable bed' }).click()
  const drawingPanel = page.getByTestId('drawing-panel')
  const { at } = await fitted(page, PLOT)
  const length = page.getByRole('textbox', { name: 'Length' })
  const angle = page.getByRole('textbox', { name: 'Angle' })
  const start = at(2, 2)
  await page.mouse.click(start.x, start.y)
  for (const [l, a] of [
    ['4', '0'],
    ['2', '270'],
    ['4', '180'],
  ]) {
    await length.fill(l!)
    await angle.fill(a!)
    await length.press('Enter')
  }
  await length.press('Enter')
  await expect(drawingPanel).toBeHidden()
  await expect(page.getByTestId('bed-area')).toHaveText('8.00 m²')

  /** Opens the plant, starts "Fill bed" and fills `rows` rows (empty = all), expecting `plants`. */
  async function fill(search: string, name: RegExp, rows: string, plants: number) {
    await openPlant(page, search)
    await expect(page.getByRole('heading', { name })).toBeVisible()
    await page.getByRole('button', { name: 'Fill bed' }).click()
    const panel = page.getByTestId('fill-panel')
    await expect(panel).toBeVisible()
    const rowsField = panel.getByRole('textbox', { name: 'Rows', exact: true })
    await rowsField.fill(rows)
    await expect.poll(() => count(page, 'fill-count')).toBe(plants)
    await rowsField.press('Enter')
    await expect(panel).toBeHidden()
    await expect(page.getByTestId('selection-count')).toHaveText(`${plants} items selected`)
  }

  await fill('lettuce', /Lettuce/, '2', 26)
  await fill('tomato', /Tomato/, '1', 8)
  await fill('carrot', /Carrot/, '', 200)

  // The calendar.
  await page.getByRole('button', { name: 'Vegetable calendar' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Vegetable calendar' })
  const cell = (month: number, activity: string) =>
    dialog.getByTestId(`veg-month-${month}`).locator(`[data-activity="${activity}"]`)
  await expect(dialog.getByTestId('veg-month-1')).toContainText('Nothing to do')
  await expect(cell(2, 'sowIndoors')).toHaveText('Lettuce')
  await expect(cell(3, 'sowIndoors')).toHaveText('Lettuce, Tomato')
  await expect(cell(3, 'sowOutdoors')).toHaveText('Carrot, Lettuce')
  await expect(cell(5, 'plantOut')).toHaveText('Lettuce, Tomato')
  await expect(cell(11, 'harvest')).toHaveText('Carrot')
  await expect(dialog.getByTestId('veg-month-12')).toContainText('Nothing to do')

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  expect(errors).toEqual([])
})
