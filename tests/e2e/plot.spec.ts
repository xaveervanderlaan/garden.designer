import { type Page, expect, test } from '@playwright/test'

/** Must match fitBounds' default padding and DEFAULT_VIEW_BOUNDS (30 × 20 m) in the app. */
const FIT_PADDING = 48
type Bounds = { minX: number; minY: number; maxX: number; maxY: number }

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
 * opens or closes, so call this once the panels are as they will be while clicking.
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
  const at = (x: number, y: number) => ({
    x: box.x + width / 2 + (x - centre.x) * scale,
    y: box.y + height / 2 + (y - centre.y) * scale,
  })
  return { box, scale, at }
}

async function newDesign(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: 'New design' }).click()
  await page.getByRole('button', { name: 'Create' }).click()
  const canvas = page.getByTestId('garden-canvas')
  await expect(canvas.locator('canvas').first()).toBeVisible()
  return canvas
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 10 })
  await page.mouse.up()
}

const area = (page: Page) => page.getByTestId('plot-area')

test('draws a 20 × 15 m plot from typed lengths', async ({ page }) => {
  const errors = collectErrors(page)
  await newDesign(page)

  await page.getByRole('toolbar').getByRole('button', { name: 'Draw plot outline' }).click()
  await expect(page.getByTestId('drawing-panel')).toBeVisible()
  const { at, scale } = await fitted(page, { minX: 0, minY: 0, maxX: 30, maxY: 20 })
  const length = page.getByRole('textbox', { name: 'Length' })
  const angle = page.getByRole('textbox', { name: 'Angle' })

  // First corner: a click (snapped to the 0.5 m grid).
  const start = at(5, 3)
  await page.mouse.click(start.x, start.y)
  await expect(length).toBeFocused()

  // 20 m to the right, by length and angle.
  await page.keyboard.type('20')
  await page.keyboard.press('Tab')
  await expect(angle).toBeFocused()
  await page.keyboard.type('0')
  await page.keyboard.press('Enter')

  // 15 m in the direction of the cursor (straight down from the second corner).
  await page.mouse.move(start.x + 20 * scale + 3, start.y + 8 * scale)
  await length.fill('15')
  await length.press('Enter')

  // 20 m to the left, with a decimal comma for good measure.
  await length.fill('20,0')
  await angle.fill('180')
  await length.press('Enter')

  // Enter on an empty field finishes the outline.
  await length.press('Enter')
  await expect(page.getByTestId('item-kind')).toHaveText('Plot boundary')
  await expect(area(page)).toHaveText('300.00 m²')
  await expect(page.getByTestId('plot-perimeter')).toHaveText('70.00 m')

  // Saved: still there after a reload.
  await expect(page.getByRole('status').filter({ hasText: /saved/ })).toHaveText(
    'All changes saved',
  )
  await page.reload()
  await page.getByRole('button', { name: 'Edit plot outline' }).click()
  await expect(area(page)).toHaveText('300.00 m²')
  expect(errors).toEqual([])
})

test('draws by clicking, removes a corner with Backspace and cancels with Escape', async ({
  page,
}) => {
  await newDesign(page)
  await page.keyboard.press('p')
  await expect(page.getByTestId('drawing-panel')).toBeVisible()
  const { at } = await fitted(page, { minX: 0, minY: 0, maxX: 30, maxY: 20 })
  for (const [x, y] of [
    [2, 2],
    [12, 2],
    [12, 9],
    [25, 15],
  ]) {
    const p = at(x!, y!)
    await page.mouse.click(p.x, p.y)
  }
  await page.keyboard.press('Backspace') // removes (25, 15)
  const back = at(2, 2)
  await page.mouse.click(back.x, back.y) // the first corner: closes the outline
  await expect(area(page)).toHaveText('35.00 m²') // a 10 × 7 m right triangle

  // Escape while drawing leaves the plot as it was.
  await page.keyboard.press('p')
  await expect(page.getByTestId('drawing-panel')).toBeVisible()
  await settled(page)
  const p = at(20, 15)
  await page.mouse.click(p.x, p.y)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('drawing-panel')).toBeHidden()
  await page.getByRole('button', { name: 'Edit plot outline' }).click()
  await expect(area(page)).toHaveText('35.00 m²')
})

test('creates a rectangle and edits the outline', async ({ page }) => {
  const errors = collectErrors(page)
  await newDesign(page)

  await page.keyboard.press('r')
  const dialog = page.getByRole('dialog', { name: 'Rectangular plot' })
  await dialog.getByLabel('Width (m)').fill('12,5')
  await dialog.getByLabel('Depth (m)').fill('8')
  await dialog.getByRole('button', { name: 'Create' }).click()
  await expect(dialog).toBeHidden()
  await expect(area(page)).toHaveText('100.00 m²')
  const { at, scale } = await fitted(page, { minX: 0, minY: 0, maxX: 12.5, maxY: 8 })

  // Edge length in the panel: A→B from 12.5 to 15 m moves corner B → a trapezoid.
  const ab = page.getByRole('textbox', { name: 'Length of edge A → B' })
  await ab.fill('15')
  await ab.press('Enter')
  await expect(area(page)).toHaveText('110.00 m²')
  await page.keyboard.press('Control+z')
  await expect(area(page)).toHaveText('100.00 m²')
  await expect(ab).toHaveValue('12.50')

  // Drag corner C 2 m to the right.
  const c = at(12.5, 8)
  await drag(page, c, { x: c.x + 2 * scale, y: c.y })
  await expect(area(page)).toHaveText('108.00 m²')

  // Click the dot on edge D→A: a new corner E at its middle, selected; Delete removes it again.
  const mid = at(0, 4)
  await page.mouse.click(mid.x, mid.y)
  await expect(page.getByRole('button', { name: 'Remove corner E' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Length of edge E → A' })).toHaveValue('4.00')
  await page.keyboard.press('Delete')
  await expect(page.getByRole('textbox', { name: 'Length of edge E → A' })).toHaveCount(0)
  await expect(area(page)).toHaveText('108.00 m²')

  // Drag corner B across the plot: the outline crosses itself → a warning.
  const b = at(12.5, 0)
  await drag(page, b, at(0, 12))
  await expect(page.getByRole('alert')).toContainText('crosses itself')
  await page.keyboard.press('Control+z')
  await expect(page.getByRole('alert')).toHaveCount(0)

  expect(errors).toEqual([])
})
