import { type Page, expect, test } from '@playwright/test'
import { FIT_PADDING, type Point, collectErrors, savedProject } from './helpers.ts'

/**
 * Structures (M8). The sample design has a 20 × 15 m plot with a 6 × 5 m terrace in the middle
 * (x 7–13, y 5–10), a bed at x 1–6, y 1–3, a fence, a bench and a tree; its grid is 0.5 m.
 */
const SAMPLE = 'tests/e2e/fixtures/sample.garden.json'

type SavedObject = {
  id: string
  kind: string
  status: string
  layer: string
  heightM?: number
  shape: { type: string; points: Point[] }
}

/** Waits two frames, so a re-fit after the plan area changed size has been drawn. */
async function settled(page: Page) {
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  )
}

/**
 * Screen mapping after "zoom to fit" of the 20 × 15 m plot. A fitted view re-fits when a panel
 * below the plan opens, until you work on the plan; call this once the panels are as they will be.
 */
async function fitted(page: Page) {
  await settled(page)
  const box = (await page.getByTestId('plan-area').boundingBox())!
  const width = Math.floor(box.width)
  const height = Math.floor(box.height)
  const scale = Math.min((width - 2 * FIT_PADDING) / 20, (height - 2 * FIT_PADDING) / 15)
  /** Screen position of a world point (metres). */
  const at = (x: number, y: number) => ({
    x: box.x + width / 2 + (x - 10) * scale,
    y: box.y + height / 2 + (y - 7.5) * scale,
  })
  return { box, scale, at }
}

async function drag(page: Page, from: Point, to: Point) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 10 })
  await page.mouse.up()
}

const savedObjects = async (page: Page) =>
  (await savedProject(page)).objects as unknown as SavedObject[]

const centreOf = (points: Point[]) => ({
  x: (Math.min(...points.map((p) => p.x)) + Math.max(...points.map((p) => p.x))) / 2,
  y: (Math.min(...points.map((p) => p.y)) + Math.max(...points.map((p) => p.y))) / 2,
})

/** The x and y of the selection's position field (metres). */
async function position(page: Page) {
  const text = (await page.getByTestId('item-position').textContent())!
  const [x, y] = [...text.matchAll(/-?[\d.]+/g)].map((m) => Number(m[0]))
  return { x: x!, y: y! }
}

const rotation = async (page: Page) =>
  Number(
    (await page.getByTestId('object-rotation').getByRole('textbox').inputValue()).replace('−', '-'),
  )

test('draws a house with a height, moves and rotates it, and undoes', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('./')
  await page.getByTestId('import-input').setInputFiles(SAMPLE)
  await page.getByRole('link', { name: 'Sample garden' }).click()
  await expect(page.getByTestId('garden-canvas').locator('canvas').first()).toBeVisible()

  // Choose a house: the drawing panel opens below the plan, and the fitted view re-fits.
  await page.getByRole('button', { name: 'Add a structure' }).click()
  await page.getByRole('menuitem', { name: /^House/ }).click()
  await expect(page.getByTestId('place-default-size')).toBeVisible()
  const { box, scale, at } = await fitted(page)

  // Drag a rectangle that sticks out of the plot on the left (snapped to the 0.5 m grid).
  const from = at(-0.8, 6.1)
  expect(from.x).toBeGreaterThan(box.x)
  await drag(page, from, at(4.9, 10.9))
  await expect(page.getByTestId('place-default-size')).toBeHidden()

  const kind = page.getByTestId('item-kind')
  await expect(kind).toHaveValue('house')
  await expect(page.getByTestId('item-status')).toHaveValue('existing')
  await expect(page.getByTestId('item-status').locator('option:checked')).toHaveText('Existing')

  const height = page.getByTestId('object-height').getByRole('textbox')
  await height.fill('6')
  await height.press('Tab')
  await expect
    .poll(async () => (await savedObjects(page)).find((o) => o.kind === 'house')?.heightM)
    .toBe(6)
  const house = (await savedObjects(page)).find((o) => o.kind === 'house')!
  expect(house).toMatchObject({ status: 'existing', layer: 'existing', heightM: 6 })
  // Partly outside the plot: nothing clamps it.
  expect(Math.min(...house.shape.points.map((p) => p.x))).toBeLessThan(0)
  const centre = centreOf(house.shape.points)
  expect(await position(page)).toEqual(centre)

  // Drag the house's body 2 m to the right: one undo step.
  const body = at(centre.x, centre.y)
  await drag(page, body, { x: body.x + 2 * scale, y: body.y })
  await expect.poll(async () => (await position(page)).x).toBeGreaterThan(centre.x + 1.5)
  const moved = await position(page)
  expect(moved.x).toBeLessThan(centre.x + 2.5)
  expect(moved.y).toBeCloseTo(centre.y, 1)
  expect(await rotation(page)).toBe(0)

  // Turn it with the Transformer's rotater (50 px above the top edge) by 30° clockwise on screen,
  // which the panel shows map-style: −30°.
  const ys = house.shape.points.map((p) => p.y)
  const pivot = at(moved.x, moved.y)
  const top = at(moved.x, Math.min(...ys)).y
  const rotater = { x: pivot.x, y: top - 50 }
  const radius = pivot.y - rotater.y
  const angle = (30 * Math.PI) / 180
  const turned = { x: pivot.x + radius * Math.sin(angle), y: pivot.y - radius * Math.cos(angle) }
  await drag(page, rotater, turned)
  await expect.poll(() => rotation(page)).toBeCloseTo(-30, 0)
  const afterTurn = await position(page)
  expect(afterTurn.x).toBeCloseTo(moved.x, 1)
  expect(afterTurn.y).toBeCloseTo(moved.y, 1)

  // Undo the rotation, then the move.
  await page.keyboard.press('Control+z')
  await expect.poll(() => rotation(page)).toBe(0)
  expect(await position(page)).toEqual(moved)
  await page.keyboard.press('Control+z')
  await expect.poll(() => position(page)).toEqual(centre)
  expect(await rotation(page)).toBe(0)
  await expect(page.getByTestId('object-height').getByRole('textbox')).toHaveValue('6.00')

  // A shed at its default size: placed in the middle of the view, selected and drawn.
  await page.getByRole('button', { name: 'Add a structure' }).click()
  await page.getByRole('menuitem', { name: /^Shed/ }).click()
  await page.getByTestId('place-default-size').click()
  await expect(page.getByTestId('place-default-size')).toBeHidden()
  await expect(kind).toHaveValue('shed')
  await expect(page.getByTestId('item-status')).toHaveValue('new')
  const shed = (await savedObjects(page)).find((o) => o.kind === 'shed')!
  expect(shed).toMatchObject({ status: 'new', layer: 'hardscape', heightM: 2.4 })

  // Click the house, then the shed: the shed is on the plan and hit where it's drawn.
  const houseOnScreen = at(centre.x, centre.y)
  await expect
    .poll(async () => {
      await page.mouse.click(houseOnScreen.x, houseOnScreen.y)
      return kind.inputValue()
    })
    .toBe('house')
  const shedCentre = centreOf(shed.shape.points)
  const shedOnScreen = at(shedCentre.x, shedCentre.y)
  await expect
    .poll(async () => {
      await page.mouse.click(shedOnScreen.x, shedOnScreen.y)
      return kind.inputValue()
    })
    .toBe('shed')

  expect(errors).toEqual([])
})
