import { readFileSync } from 'node:fs'
import { type Page, expect, test } from '@playwright/test'
import {
  type Bounds,
  type Point,
  collectErrors,
  fitted,
  pixelAt,
  savedProjects,
  settled,
} from './helpers.ts'

// Runs only in the `phone` Playwright project (Pixel 7: touch, mobile viewport).

const PLOT: Bounds = { minX: 0, minY: 0, maxX: 20, maxY: 15 }

/** The sample garden plus a lettuce at (3, 2) and a sea thrift at (5, 2), in its border bed. */
function sampleWithPlants() {
  const file = JSON.parse(readFileSync('tests/e2e/fixtures/sample.garden.json', 'utf8'))
  file.project.plantings.push(
    { id: 'lettuce', plantId: 'lactuca-sativa', position: { x: 3, y: 2 }, plantedYear: 2026 },
    { id: 'thrift', plantId: 'armeria-maritima', position: { x: 5, y: 2 }, plantedYear: 2026 },
  )
  return {
    name: 'sample.garden.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(file)),
  }
}

/** Moves touch points (one per finger) from `from` to `to` in steps, via the DevTools protocol. */
async function touchDrag(page: Page, from: Point[], to: Point[], steps = 10) {
  const cdp = await page.context().newCDPSession(page)
  const points = (t: number) =>
    from.map((a, id) => {
      const b = to[id]!
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, id }
    })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(0) })
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: points(i / steps),
    })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

const isWhite = ({ r, g, b }: { r: number; g: number; b: number }) => r + g + b > 750

async function openSample(page: Page) {
  await page.goto('./')
  await page.getByTestId('import-input').setInputFiles(sampleWithPlants())
  await expect(page.getByRole('heading', { level: 1, name: 'Sample garden' })).toBeVisible()
  await expect(page.getByTestId('plan-area').locator('canvas').first()).toBeVisible()
}

test('imports a design on the phone and opens it in the viewer without editing tools', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await openSample(page)
  expect(page.url()).toMatch(/#\/v\//)
  await expect(page.getByRole('button', { name: 'Layers' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('an editor link on a phone opens the viewer', async ({ page }) => {
  const errors = collectErrors(page)
  await openSample(page)
  const id = String((await savedProjects(page))[0]!.id)
  await page.goto(`./#/p/${id}`)
  await expect(page).toHaveURL(new RegExp(`#/v/${id}$`))
  await expect(page.getByRole('heading', { level: 1, name: 'Sample garden' })).toBeVisible()
  expect(errors).toEqual([])
})

test('fits the viewer bar at 360 px wide', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await openSample(page)
  const names = [
    'Back to your designs',
    'Fit the plan to the screen',
    'Layers',
    'Vegetable calendar',
  ]
  for (const name of names) {
    const box = (await page
      .getByRole(name === 'Back to your designs' ? 'link' : 'button', { name })
      .boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(360)
    expect(box.width).toBeGreaterThanOrEqual(32)
  }
  const doc = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(doc).toBeLessThanOrEqual(360)
})

test('toggles layers and shows the vegetable calendar', async ({ page }) => {
  const errors = collectErrors(page)
  await openSample(page)
  const { at } = await fitted(page, PLOT)
  const before = (await savedProjects(page))[0]!.layers

  await page.getByRole('button', { name: 'Layers' }).click()
  const layers = page.getByRole('dialog', { name: 'Layers' })
  await layers.getByRole('checkbox', { name: 'Beds & plants' }).uncheck()
  await settled(page)
  const thrift = at(5, 2)
  await page.touchscreen.tap(thrift.x, thrift.y)
  await expect(page.getByRole('dialog', { name: 'Plot' })).toBeVisible()
  expect((await savedProjects(page))[0]!.layers).toEqual(before)

  await page.getByRole('button', { name: 'Vegetable calendar' }).click()
  const calendar = page.getByRole('dialog', { name: 'Vegetable calendar' })
  await expect(calendar.getByTestId('veg-calendar')).toContainText('Lettuce')
  expect(errors).toEqual([])
})

test('taps a plant, then pans and pinch-zooms with touch', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('./')
  await page.getByTestId('import-input').setInputFiles(sampleWithPlants())
  await expect(page.getByRole('heading', { level: 1, name: 'Sample garden' })).toBeVisible()
  await expect(page.getByTestId('plan-area').locator('canvas').first()).toBeVisible()

  // Fitted and drawn: the terrace is not white.
  const { at } = await fitted(page, PLOT)
  await expect.poll(async () => isWhite(await pixelAt(page, at(8, 6)))).toBe(false)

  const sheet = page.getByRole('dialog')
  const thrift = at(5, 2)
  await page.touchscreen.tap(thrift.x, thrift.y)
  await expect(sheet).toHaveAccessibleName('Sea thrift')

  // One finger pans by (−60, 40): the sea thrift moves along.
  const start = at(12, 4)
  await touchDrag(page, [start], [{ x: start.x - 60, y: start.y + 40 }])
  await settled(page)
  const moved = { x: thrift.x - 60, y: thrift.y + 40 }
  const lettuce = { x: at(3, 2).x - 60, y: at(3, 2).y + 40 }
  await page.touchscreen.tap(lettuce.x, lettuce.y)
  await expect(sheet).toHaveAccessibleName('Lettuce')
  await page.touchscreen.tap(moved.x, moved.y)
  await expect(sheet).toHaveAccessibleName('Sea thrift')

  // Two fingers 60 → 120 px apart around the sea thrift double the scale around it.
  await touchDrag(
    page,
    [
      { x: moved.x - 30, y: moved.y },
      { x: moved.x + 30, y: moved.y },
    ],
    [
      { x: moved.x - 60, y: moved.y },
      { x: moved.x + 60, y: moved.y },
    ],
  )
  await settled(page)
  const zoomed = { x: moved.x + (lettuce.x - moved.x) * 2, y: moved.y + (lettuce.y - moved.y) * 2 }
  await page.touchscreen.tap(zoomed.x, zoomed.y)
  await expect(sheet).toHaveAccessibleName('Lettuce')

  // A tap outside the plot (above it now) closes the sheet.
  const box = (await page.getByTestId('plan-area').boundingBox())!
  await page.touchscreen.tap(box.x + 5, box.y + 5)
  await expect(sheet).toBeHidden()
  expect(errors).toEqual([])
})
