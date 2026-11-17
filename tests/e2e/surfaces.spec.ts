import { type Page, expect, test } from '@playwright/test'
import { FIT_PADDING, type Point, collectErrors, savedProject } from './helpers.ts'

/**
 * Surfaces, boundaries and net area (M9). The sample design has a 20 × 15 m plot with a terrace
 * at x 7–13, y 5–10, so this test works to the right of it; its grid is 0.5 m.
 */
const SAMPLE = 'tests/e2e/fixtures/sample.garden.json'

type SavedObject = {
  id: string
  kind: string
  material?: string
  heightM?: number
  shape: { type: string; points: Point[]; thicknessM?: number }
}

/** Waits two frames, so a re-fit after the plan area changed size has been drawn. */
async function settled(page: Page) {
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  )
}

/** Screen position of a world point (metres) after "zoom to fit" of the 20 × 15 m plot. */
async function fitted(page: Page) {
  await settled(page)
  const box = (await page.getByTestId('plan-area').boundingBox())!
  const width = Math.floor(box.width)
  const height = Math.floor(box.height)
  const scale = Math.min((width - 2 * FIT_PADDING) / 20, (height - 2 * FIT_PADDING) / 15)
  return (x: number, y: number) => ({
    x: box.x + width / 2 + (x - 10) * scale,
    y: box.y + height / 2 + (y - 7.5) * scale,
  })
}

async function drag(page: Page, from: Point, to: Point) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 10 })
  await page.mouse.up()
}

const savedObjects = async (page: Page) =>
  (await savedProject(page)).objects as unknown as SavedObject[]

test('draws a lawn, a terrace on it and a fence, and shows gross and net areas', async ({
  page,
}) => {
  const errors = collectErrors(page)
  await page.goto('./')
  await page.getByTestId('import-input').setInputFiles(SAMPLE)
  await page.getByRole('link', { name: 'Sample garden' }).click()
  await expect(page.getByTestId('garden-canvas').locator('canvas').first()).toBeVisible()

  const kind = page.getByTestId('item-kind')
  const gross = page.getByTestId('object-area')
  const net = page.getByTestId('object-net-area')
  const addSurface = page.getByRole('button', { name: 'Add a surface' })

  // A 5 × 8 m lawn, dragged as a rectangle (the drawing panel below the plan re-fits the view).
  await addSurface.click()
  await page.getByRole('menuitem', { name: /^Lawn/ }).click()
  await expect(page.getByTestId('place-default-size')).toBeVisible()
  const at = await fitted(page)
  await drag(page, at(14, 1), at(19, 9))
  await expect(page.getByTestId('place-default-size')).toBeHidden()
  await expect(kind).toHaveValue('lawn')
  await expect(gross).toHaveText(/^40\.00\sm²$/)
  await expect(net).toHaveText(/^40\.00\sm²$/)

  // A 3 × 2 m wooden terrace on top of it.
  await addSurface.click()
  await page.getByRole('menuitem', { name: /^Terrace/ }).click()
  await drag(page, at(15, 2), at(18, 4))
  await expect(kind).toHaveValue('terrace')
  await expect(gross).toHaveText(/^6\.00\sm²$/)
  await page.getByTestId('object-material').selectOption({ label: 'Wood' })
  await expect
    .poll(async () => {
      const terraces = (await savedObjects(page)).filter((o) => o.kind === 'terrace')
      return terraces.map((o) => o.material ?? null)
    })
    .toContain('wood')

  // The lawn's net area leaves out the terrace drawn on top of it.
  const lawn = at(14.5, 8)
  const selectLawn = () =>
    expect
      .poll(async () => {
        await page.mouse.click(lawn.x, lawn.y)
        return kind.inputValue()
      })
      .toBe('lawn')
  await selectLawn()
  await expect(gross).toHaveText(/^40\.00\sm²$/)
  await expect(net).toHaveText(/^34\.00\sm²$/)

  // A 5 m fence along the lawn's lower edge: a line, with the fence's thickness and height.
  await page.getByRole('button', { name: 'Add a boundary' }).click()
  await page.getByRole('menuitem', { name: /^Fence/ }).click()
  for (const [x, y] of [
    [14, 9],
    [19, 9],
  ] as const) {
    const point = at(x, y)
    await page.mouse.click(point.x, point.y)
  }
  await page.getByTestId('drawing-panel').getByRole('button', { name: 'Finish' }).click()
  await expect(page.getByTestId('drawing-panel')).toBeHidden()
  await expect(kind).toHaveValue('fence')
  await expect(page.getByTestId('object-length')).toHaveText(/^5\.00\sm$/)
  await expect
    .poll(async () => (await savedObjects(page)).filter((o) => o.kind === 'fence').length)
    .toBe(2)
  const fence = (await savedObjects(page)).find((o) => o.kind === 'fence' && o.id !== 'fence')!
  expect(fence.shape.thicknessM).toBe(0.05)
  expect(fence.heightM).toBe(1.8)

  // Lines don't count for the net area.
  await selectLawn()
  await expect(net).toHaveText(/^34\.00\sm²$/)

  expect(errors).toEqual([])
})
