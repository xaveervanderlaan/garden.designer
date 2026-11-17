import { type Page, expect, test } from '@playwright/test'
import { type Bounds, type Point, collectErrors, fitted, openPlant, pixelAt } from './helpers.ts'

/**
 * Growth over the years (M13) and the seasons (M14): the view bar's year and month change how the
 * plants are drawn, and the bloom chart shows what flowers when. The plan is a canvas, so the
 * drawing is checked by reading its pixels.
 */

const PLOT: Bounds = { minX: 0, minY: 0, maxX: 20, maxY: 15 }

/** Leaves (green fill), a blue flower, or neither (the plot, grid lines, a pale dormant plant). */
async function colourAt(page: Page, point: Point): Promise<'green' | 'blue' | 'brown' | 'pale'> {
  const { r, g, b } = await pixelAt(page, point)
  if (g - r > 20 && g - b > 20) return 'green'
  if (b - r > 60 && b - g > 40) return 'blue'
  if (r < 140 && r > g && g > b) return 'brown'
  return 'pale'
}

test('shows the plants in a year after planting and in a month, and the bloom chart', async ({
  page,
}) => {
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

  // A field maple (8 m across when grown) at (6, 7.5) and a cranesbill at (15, 7.5).
  await openPlant(page, 'Field maple')
  await page.getByRole('button', { name: 'Place', exact: true }).click()
  await expect(page.getByTestId('stamp-panel')).toBeVisible()
  // Placing ends the fitted view, so these positions stay valid when panels open and close.
  const { at, scale } = await fitted(page, PLOT)
  const tree = at(6, 7.5)
  await page.mouse.click(tree.x, tree.y)
  await page.keyboard.press('Escape')
  await openPlant(page, 'Rozanne')
  await page.getByRole('button', { name: 'Place', exact: true }).click()
  const perennial = at(15, 7.5)
  await page.mouse.click(perennial.x, perennial.y)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('stamp-panel')).toBeHidden()

  // A point inside the tree's crown, 2.5 m from its trunk and between the radial lines.
  const angle = (22.5 * Math.PI) / 180
  const inCrown = {
    x: tree.x + 2.5 * scale * Math.cos(angle),
    y: tree.y - 2.5 * scale * Math.sin(angle),
  }
  await expect.poll(() => colourAt(page, inCrown)).toBe('green')
  await expect.poll(() => colourAt(page, perennial)).toBe('blue')

  // The planting year: the tree is a young tree, so that point is outside it.
  const view = page.getByRole('group', { name: 'View' })
  const year = view.getByRole('slider', { name: 'Year' })
  await expect(year).toHaveAttribute('aria-valuetext', 'Fully grown')
  await year.focus()
  await page.keyboard.press('Home')
  await expect(view.getByTestId('view-year')).toHaveText(/^Planting year \(\d{4}\)$/)
  await expect.poll(() => colourAt(page, inCrown)).toBe('pale')
  // Clicking there doesn't hit the tree any more.
  await page.mouse.click(inCrown.x, inCrown.y)
  await expect(page.getByRole('region', { name: 'Properties' })).toContainText('Nothing selected')

  // Ten years on it has grown to 3.5 m across (it takes 25 years to grow to 8 m).
  await year.focus()
  await page.keyboard.press('ArrowLeft') // stays at the planting year
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight')
  await expect(view.getByTestId('view-year')).toHaveText(/^\d{4} \(\+10 years\)$/)
  const nearTrunk = {
    x: tree.x + 1.2 * scale * Math.cos(angle),
    y: tree.y - 1.2 * scale * Math.sin(angle),
  }
  await expect.poll(() => colourAt(page, nearTrunk)).toBe('green')
  await expect.poll(() => colourAt(page, inCrown)).toBe('pale')

  // Fully grown again, in January: the maple is bare (outlines and its trunk), the cranesbill
  // has died back.
  await year.focus()
  await page.keyboard.press('End')
  await expect(view.getByTestId('view-year')).toHaveText('Fully grown')
  await view.getByRole('combobox', { name: 'Month' }).selectOption('January')
  await expect.poll(() => colourAt(page, inCrown)).toBe('pale')
  await expect.poll(() => colourAt(page, tree)).toBe('brown')
  await expect.poll(() => colourAt(page, perennial)).toBe('pale')

  // The bloom chart: the maple flowers in April and May (lime), the cranesbill June–October (blue).
  await view.getByRole('button', { name: 'Bloom chart' }).click()
  const dialog = page.getByRole('dialog', { name: 'Bloom chart' })
  const rows = dialog.getByTestId('bloom-row')
  await expect(rows.getByRole('rowheader')).toHaveText(['Field maple1×', "Cranesbill 'Rozanne'1×"])
  const bloomMonths = (row: number) =>
    rows
      .nth(row)
      .getByRole('cell')
      .evaluateAll((cells) =>
        cells.flatMap((c, i) => (c.hasAttribute('data-bloom') ? [i + 1] : [])),
      )
  expect(await bloomMonths(0)).toEqual([4, 5])
  expect(await bloomMonths(1)).toEqual([6, 7, 8, 9, 10])
  await expect(rows.nth(1).getByRole('cell').nth(6).locator('span').first()).toHaveCSS(
    'background-color',
    'rgb(77, 120, 204)',
  )
  await expect(dialog.getByTestId('bloom-chart-hint')).toHaveText('Nothing in bloom in Nov–Mar.')

  // A month's column shows that month on the plan: the cranesbill in flower.
  await dialog.getByRole('button', { name: 'Jul', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(view.getByRole('combobox', { name: 'Month' })).toHaveValue('7')
  await expect.poll(() => colourAt(page, perennial)).toBe('blue')
  await expect.poll(() => colourAt(page, inCrown)).toBe('green')

  expect(errors).toEqual([])
})
