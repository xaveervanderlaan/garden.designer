import { type Page, expect, test } from '@playwright/test'
import { type Bounds, type Point, collectErrors, fitted, pixelAt } from './helpers.ts'

/**
 * The sun-hours map (M12). The sample design has a 20 × 15 m plot with north at the top and a
 * 1.8 m fence along its south side (y = 15), so in midwinter the strip along the fence gets no
 * sun. A sea thrift (full sun only) planted there gets a sun warning once the map is computed.
 */
const SAMPLE = 'tests/e2e/fixtures/sample.garden.json'
const PLOT: Bounds = { minX: 0, minY: 0, maxX: 20, maxY: 15 }

const brightness = ({ r, g, b }: { r: number; g: number; b: number }) => r + g + b

/** The heatmap's shade colour (dark blue) over the plot: blue-dominant and darker than before. */
async function isShade(page: Page, point: Point, before: { r: number; g: number; b: number }) {
  const pixel = await pixelAt(page, point)
  return pixel.b > pixel.r + 20 && pixel.b > pixel.g + 20 && brightness(pixel) < brightness(before)
}

test('computes the sun hours for a day, shows them on the plan and warns about sun', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await page.goto('./')
  await page.getByTestId('import-input').setInputFiles(SAMPLE)
  await page.getByRole('link', { name: 'Sample garden' }).click()
  await expect(page.getByTestId('garden-canvas').locator('canvas').first()).toBeVisible()
  const { at } = await fitted(page, PLOT)
  const nearFence = at(12, 14.75)
  const north = at(12, 1)
  const before = await pixelAt(page, nearFence)

  // Drag a sea thrift from the library to the strip along the fence.
  await page.getByRole('searchbox', { name: 'Search plants' }).fill('Sea thrift')
  const box = (await page.getByTestId('plan-area').boundingBox())!
  const drop = at(10, 14.6)
  await page
    .getByRole('list', { name: 'Plants' })
    .getByRole('button')
    .first()
    .dragTo(page.getByTestId('plan-area'), {
      targetPosition: { x: drop.x - box.x, y: drop.y - box.y },
    })
  const properties = page.getByRole('region', { name: 'Properties' })
  await expect(page.getByTestId('item-kind')).toContainText('Sea thrift')
  await expect(properties).not.toContainText('sun-hours map')
  const warnings = page.getByRole('region', { name: 'Warnings' })
  await expect(warnings).not.toContainText('Sea thrift stands in')

  // Compute the map for midwinter's day.
  await page.getByRole('button', { name: 'Sun hours', exact: true }).click()
  const panel = page.getByTestId('sun-map-panel')
  await panel.getByRole('radio', { name: 'One day' }).check()
  await panel.getByLabel('Date').fill('2026-12-21')
  await panel.getByTestId('sun-map-compute').click()
  await expect(panel.getByTestId('sun-share-shade')).toBeVisible()
  await expect(panel.getByTestId('sun-map-progress')).toBeHidden()
  const shade = Number((await panel.getByTestId('sun-share-shade').textContent())!.match(/\d+/)![0])
  expect(shade).toBeGreaterThan(0)
  await expect(panel.getByTestId('sun-map-compute')).toHaveText('Recompute')

  // The strip along the fence is drawn in the shade colour; the north of the plot isn't.
  await expect.poll(() => isShade(page, nearFence, before)).toBe(true)
  const shaded = await pixelAt(page, nearFence)
  const sunnier = await pixelAt(page, north)
  expect(Math.abs(brightness(sunnier) - brightness(shaded))).toBeGreaterThan(60)

  // The sea thrift stands in shade: a warning in the list and in its properties.
  await expect(warnings).toContainText('Sea thrift stands in shade')
  await expect(properties).toContainText('Stands in shade on the sun-hours map')

  // Hide the map: the plan looks as before.
  await panel.getByRole('checkbox', { name: 'Show on plan' }).uncheck()
  await expect
    .poll(async () => Math.abs(brightness(await pixelAt(page, nearFence)) - brightness(before)))
    .toBeLessThan(15)

  // Part shade from 0 h: the same map now counts that spot as part shade, without recomputing.
  await page.getByRole('button', { name: 'Design settings' }).click()
  const settings = page.getByRole('dialog', { name: 'Design settings' })
  await settings.getByLabel('Part shade from (h)').fill('0')
  await settings.getByRole('button', { name: 'Save' }).click()
  await expect(settings).toBeHidden()
  await expect(warnings).toContainText('Sea thrift stands in part shade')
  await expect(warnings).not.toContainText('Sea thrift stands in shade')
  await expect(panel.getByTestId('sun-share-shade')).toHaveText(/^0\s?%$/)

  expect(errors).toEqual([])
})
