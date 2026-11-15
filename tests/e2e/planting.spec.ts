import { type Page, expect, test } from '@playwright/test'

/** Must match fitBounds' default padding in src/geometry/viewport.ts. */
const FIT_PADDING = 48
type Bounds = { minX: number; minY: number; maxX: number; maxY: number }
const PLOT: Bounds = { minX: 0, minY: 0, maxX: 20, maxY: 15 }

function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()))
  page.on('pageerror', (err) => errors.push(err.message))
  return errors
}

/** Waits two frames, so a re-fit after the plan area changed size has been drawn. */
async function settled(page: Page) {
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  )
}

/**
 * Screen mapping after "zoom to fit" of `bounds`. A fitted view re-fits when a panel below the plan
 * opens or closes (until you click on the plan), so call this once the panels are as they will be.
 */
async function fitted(page: Page, bounds: Bounds) {
  await settled(page)
  const box = (await page.getByTestId('plan-area').boundingBox())!
  const width = Math.floor(box.width)
  const height = Math.floor(box.height)
  const w = bounds.maxX - bounds.minX
  const h = bounds.maxY - bounds.minY
  const scale = Math.min((width - 2 * FIT_PADDING) / w, (height - 2 * FIT_PADDING) / h)
  const centre = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }
  /** Screen position of a world point (metres). */
  const at = (x: number, y: number) => ({
    x: box.x + width / 2 + (x - centre.x) * scale,
    y: box.y + height / 2 + (y - centre.y) * scale,
  })
  return { box, at }
}

const count = async (page: Page, testId: string) =>
  Number((await page.getByTestId(testId).textContent())!.replace(/\D/g, ''))

/** Opens a plant from the library (search, first result). */
async function openPlant(page: Page, search: string) {
  const back = page.getByRole('button', { name: 'Back to the list' })
  if (await back.isVisible()) await back.click()
  await page.getByRole('searchbox', { name: 'Search plants' }).fill(search)
  await page.getByRole('list', { name: 'Plants' }).getByRole('button').first().click()
}

test('draws a bed and plants it up: drag, stamp, fill bed and a row', async ({ page }) => {
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

  // A 6 × 3 m ornamental bed from (2, 2), with typed lengths.
  await page.getByRole('toolbar').getByRole('button', { name: 'Draw ornamental bed' }).click()
  const drawingPanel = page.getByTestId('drawing-panel')
  await expect(drawingPanel).toContainText('Ornamental bed:')
  const { at } = await fitted(page, PLOT)
  const length = page.getByRole('textbox', { name: 'Length' })
  const angle = page.getByRole('textbox', { name: 'Angle' })
  const start = at(2, 2)
  await page.mouse.click(start.x, start.y)
  for (const [l, a] of [
    ['6', '0'],
    ['3', '270'],
    ['6', '180'],
  ]) {
    await length.fill(l!)
    await angle.fill(a!)
    await length.press('Enter')
  }
  await length.press('Enter')
  await expect(drawingPanel).toBeHidden()
  await expect(page.getByTestId('bed-area')).toHaveText('18.00 m²')
  await expect(page.getByTestId('item-kind')).toHaveValue('bed-ornamental')

  // Drag lavender from the library into the bed: placed, selected and linked to the bed.
  await page.getByRole('searchbox', { name: 'Search plants' }).fill('lavendel')
  const box = (await page.getByTestId('plan-area').boundingBox())!
  const drop = at(3, 3)
  await page
    .getByRole('list', { name: 'Plants' })
    .getByRole('button')
    .first()
    .dragTo(page.getByTestId('plan-area'), {
      targetPosition: { x: drop.x - box.x, y: drop.y - box.y },
    })
  await expect(page.getByTestId('item-kind')).toContainText('English lavender')
  await expect(page.getByTestId('planting-bed')).toHaveText('Ornamental bed 1')

  // Stamp two catmints, then stop with Escape.
  await openPlant(page, 'catmint')
  await page.getByRole('button', { name: 'Place', exact: true }).click()
  await expect(page.getByTestId('stamp-panel')).toBeVisible()
  for (const x of [6, 7]) {
    const p = at(x, 4)
    await page.mouse.click(p.x, p.y)
  }
  await expect(page.getByTestId('stamp-count')).toHaveText('2 placed')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('stamp-panel')).toBeHidden()

  // Fill the (only) bed with stonecrop, around the plants already in it: one undo step.
  await openPlant(page, 'autumn joy')
  await page.getByRole('button', { name: 'Fill bed' }).click()
  const fillPanel = page.getByTestId('fill-panel')
  await expect(fillPanel).toContainText('Ornamental bed 1')
  await expect(fillPanel.getByRole('textbox', { name: 'Spacing' })).toHaveValue('0.5')
  const filled = await count(page, 'fill-count')
  expect(filled).toBeGreaterThan(40)
  await fillPanel.getByRole('button', { name: 'Fill bed' }).click()
  await expect(fillPanel).toBeHidden()
  await expect(page.getByTestId('selection-count')).toHaveText(`${filled} items selected`)
  await expect(page.getByTestId('no-warnings')).toBeVisible()

  // A row of box along a 3 m line: 3 per metre by default.
  await openPlant(page, 'buxus')
  await page.getByRole('button', { name: 'Plant a row' }).click()
  await expect(drawingPanel).toContainText('Row of Box:')
  const rowStart = at(2, 8)
  await page.mouse.click(rowStart.x, rowStart.y)
  await length.fill('3')
  await angle.fill('0')
  await length.press('Enter')
  await expect(page.getByTestId('row-count')).toHaveText('10 plants')
  await length.press('Enter')
  await expect(drawingPanel).toBeHidden()
  await expect(page.getByTestId('selection-count')).toHaveText('10 items selected')

  // The planting list: per species, then per bed.
  const list = page.getByRole('region', { name: /^Planting list/ })
  const rows = list.getByTestId('planting-row')
  await expect(rows).toHaveText([
    /^1English lavender1$/,
    /^2Catmint2$/,
    new RegExp(`^3Stonecrop 'Autumn Joy'${filled}$`),
    /^4Box10$/,
  ])
  await expect(list.getByTestId('planting-total')).toHaveText(`${13 + filled} plants in total`)
  await list.getByRole('button', { name: 'Per bed' }).click()
  await expect(list.getByRole('heading', { level: 3 })).toHaveText([
    `Ornamental bed 1${3 + filled}`,
    'Not in a bed10',
  ])

  // Undo takes the whole row away in one step.
  await page.keyboard.press('Control+z')
  await expect(list.getByTestId('planting-total')).toHaveText(`${3 + filled} plants in total`)

  // A second lavender on top of the first (dragged from its detail card): an overlap warning,
  // in the list and on the plant.
  await openPlant(page, 'lavendel')
  const close = at(3.1, 3)
  await page.getByTestId('detail-symbol').dragTo(page.getByTestId('plan-area'), {
    targetPosition: { x: close.x - box.x, y: close.y - box.y },
  })
  const warnings = page.getByRole('region', { name: /^Warnings/ })
  await expect(warnings.getByRole('button')).toContainText(['English lavender too close together'])
  await expect(page.getByRole('region', { name: 'Properties' })).toContainText(
    /Overlaps English lavender by \d+% at full size/,
  )

  // Everything is saved.
  await expect(page.getByRole('status').filter({ hasText: /saved/ })).toHaveText(
    'All changes saved',
  )
  await page.reload()
  await expect(
    page.getByRole('region', { name: /^Planting list/ }).getByTestId('planting-total'),
  ).toHaveText(`${4 + filled} plants in total`)

  expect(errors).toEqual([])
})
