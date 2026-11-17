import { expect, test } from '@playwright/test'
import { type Bounds, collectErrors, fitted } from './helpers.ts'

/**
 * A plant that grows over a structure or paving gets a warning. The sample design has a terrace
 * (x 7–13, y 5–10); a glossy abelia (1.5 m wide when grown) dropped at its west edge reaches
 * 0.3 of its width into it, and is still small in the planting year.
 */
const SAMPLE = 'tests/e2e/fixtures/sample.garden.json'
const PLOT: Bounds = { minX: 0, minY: 0, maxX: 20, maxY: 15 }

test('warns when a shrub grows over the terrace', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('./')
  await page.getByTestId('import-input').setInputFiles(SAMPLE)
  await page.getByRole('link', { name: 'Sample garden' }).click()
  await expect(page.getByTestId('garden-canvas').locator('canvas').first()).toBeVisible()
  const { at } = await fitted(page, PLOT)
  const warnings = page.getByRole('region', { name: 'Warnings' })
  await expect(warnings.getByTestId('no-warnings')).toBeVisible()

  await page.getByRole('searchbox', { name: 'Search plants' }).fill('Glossy abelia')
  const box = (await page.getByTestId('plan-area').boundingBox())!
  const drop = at(6.7, 7.5)
  await page
    .getByRole('list', { name: 'Plants' })
    .getByRole('button')
    .first()
    .dragTo(page.getByTestId('plan-area'), {
      targetPosition: { x: drop.x - box.x, y: drop.y - box.y },
    })
  await expect(page.getByTestId('item-kind')).toContainText('Glossy abelia')

  const line = warnings.getByRole('button', {
    name: 'Glossy abelia too close to a structure or paving (terrace)',
  })
  await expect(line).toBeVisible()
  await line.click()
  await expect(page.getByRole('region', { name: 'Properties' })).toContainText(
    /Grows \d+\s?% over a structure/,
  )

  // Small in the planting year: no warning; fully grown again: back.
  const year = page.getByRole('slider', { name: 'Year' })
  await year.focus()
  await page.keyboard.press('Home')
  await expect(warnings.getByTestId('no-warnings')).toBeVisible()
  await page.keyboard.press('End')
  await expect(line).toBeVisible()

  // Undoing the drop removes the plant and its warning.
  await page.locator('body').click({ position: { x: 2, y: 2 } })
  await page.keyboard.press('Control+z')
  await expect(warnings.getByTestId('no-warnings')).toBeVisible()
  expect(errors).toEqual([])
})
