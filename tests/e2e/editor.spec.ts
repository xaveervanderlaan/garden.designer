import { type Locator, type Page, expect, test } from '@playwright/test'

/**
 * Editor tests. The sample design has a 20 × 15 m plot with a 6 × 5 m terrace in the middle
 * (centre 10, 7.5), a border, a fence, a bench and a tree.
 */
const SAMPLE = 'tests/e2e/fixtures/sample.garden.json'
/** Must match fitBounds' default padding in src/geometry/viewport.ts. */
const FIT_PADDING = 48

function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()))
  page.on('pageerror', (err) => errors.push(err.message))
  return errors
}

async function openSample(page: Page) {
  await page.goto('./')
  await page.getByTestId('import-input').setInputFiles(SAMPLE)
  await page.getByRole('link', { name: 'Sample garden' }).click()
  const canvas = page.getByTestId('garden-canvas')
  await expect(canvas.locator('canvas').first()).toBeVisible()
  return plan(canvas)
}

/** Screen geometry of the plan right after "zoom to fit" (plot 20 × 15 m, centred). */
async function plan(canvas: Locator) {
  const box = (await canvas.boundingBox())!
  const scale = Math.min((box.width - 2 * FIT_PADDING) / 20, (box.height - 2 * FIT_PADDING) / 15)
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  /** Screen position of a world point (metres). */
  const at = (x: number, y: number) => ({
    x: centre.x + (x - 10) * scale,
    y: centre.y + (y - 7.5) * scale,
  })
  return { box, scale, centre, at }
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 8 })
  await page.mouse.up()
}

const zoomPercent = async (page: Page) =>
  Number((await page.getByTestId('zoom-level').textContent())!.replace(/\D/g, ''))

test.describe('editor', () => {
  test('zooms and pans', async ({ page }) => {
    const errors = collectErrors(page)
    const { centre } = await openSample(page)
    const fitted = await zoomPercent(page)

    await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
    expect(await zoomPercent(page)).toBeGreaterThan(fitted)
    await page.keyboard.press('-')
    expect(await zoomPercent(page)).toBe(fitted)

    await page.mouse.move(centre.x, centre.y)
    await page.mouse.wheel(0, -400)
    await expect.poll(() => zoomPercent(page)).toBeGreaterThan(fitted)
    await page.keyboard.press('0')
    await expect.poll(() => zoomPercent(page)).toBe(fitted)

    // The cursor position (in metres) under a fixed screen point changes when panning.
    const position = page.getByTestId('cursor-position')
    const readPosition = async () => {
      await page.mouse.move(centre.x + 1, centre.y)
      await page.mouse.move(centre.x, centre.y)
      return position.textContent()
    }
    const before = await readPosition()

    await page.keyboard.down('Space')
    await drag(page, centre, { x: centre.x + 120, y: centre.y + 60 })
    await page.keyboard.up('Space')
    const afterSpacePan = await readPosition()
    expect(afterSpacePan).not.toBe(before)

    await page.mouse.move(centre.x, centre.y)
    await page.mouse.down({ button: 'middle' })
    await page.mouse.move(centre.x - 80, centre.y - 40, { steps: 5 })
    await page.mouse.up({ button: 'middle' })
    expect(await readPosition()).not.toBe(afterSpacePan)

    // Panning never moves items.
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled()
    expect(errors).toEqual([])
  })

  test('selects, moves, resizes, undoes and redoes', async ({ page }) => {
    const errors = collectErrors(page)
    const { centre, scale, at } = await openSample(page)
    const kind = page.getByTestId('item-kind')
    const position = page.getByTestId('item-position')

    await page.mouse.click(centre.x, centre.y)
    await expect(kind).toHaveText('Terrace')
    await expect(position).toHaveText('x 10.00 m · y 7.50 m')

    // Drag 2 m to the right: one undo step.
    await drag(page, centre, { x: centre.x + 2 * scale, y: centre.y })
    await expect(position).toHaveText(/^x 1[12]\.\d\d\sm · y 7\.50\sm$/)
    const moved = await position.textContent()
    await page.keyboard.press('Control+z')
    await expect(position).toHaveText('x 10.00 m · y 7.50 m')
    await page.keyboard.press('Control+Shift+z')
    await expect(position).toHaveText(moved!)
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(position).toHaveText('x 10.00 m · y 7.50 m')

    // Resize: drag the right-middle handle 2 m outwards; the centre moves 1 m.
    const rightHandle = at(13, 7.5)
    await drag(page, rightHandle, { x: rightHandle.x + 2 * scale, y: rightHandle.y })
    await expect(position).toHaveText(/^x 1[01]\.\d\d\sm · y 7\.50\sm$/)
    await expect(position).not.toHaveText('x 10.00 m · y 7.50 m')
    await page.keyboard.press('Control+z')
    await expect(position).toHaveText('x 10.00 m · y 7.50 m')

    // Nudges in quick succession form one undo step.
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Shift+ArrowDown')
    await expect(position).toHaveText('x 10.10 m · y 8.50 m')
    await page.keyboard.press('Control+z')
    await expect(position).toHaveText('x 10.00 m · y 7.50 m')

    expect(errors).toEqual([])
  })

  test('copies, pastes, deletes and respects locked layers', async ({ page }) => {
    const { centre } = await openSample(page)
    const position = page.getByTestId('item-position')
    const count = page.getByTestId('selection-count')
    const properties = page.getByRole('region', { name: 'Properties' })

    await page.mouse.click(centre.x, centre.y)
    await page.keyboard.press('Control+c')
    await page.keyboard.press('Control+v')
    await expect(position).toHaveText('x 11.00 m · y 8.50 m') // the copy, 1 m further
    await expect(count).toHaveText('1 item selected')

    await page.keyboard.press('Delete')
    await expect(properties.getByText('Nothing selected.')).toBeVisible()
    await page.keyboard.press('Control+z') // copy back
    await page.keyboard.press('Control+z') // paste undone

    await page.keyboard.press('Control+a')
    await expect(count).toHaveText('5 items selected')
    await page.keyboard.press('Escape')
    await expect(count).toHaveText('')

    // Locking a layer drops its items from the selection and makes them unclickable.
    await page.keyboard.press('Control+a')
    await page.getByRole('button', { name: 'Lock Hardscape & structures' }).click()
    await expect(count).toHaveText('2 items selected') // the border and the tree
    await page.mouse.click(centre.x, centre.y) // the terrace is locked now
    await expect(properties.getByText('Nothing selected.')).toBeVisible()
    await page.getByRole('button', { name: 'Unlock Hardscape & structures' }).click()
    // Konva refreshes its hit map on the next animation frame; a click in the same few ms (only a
    // robot is that fast) can miss, so retry. Clicking a selected item again changes nothing.
    await expect
      .poll(async () => {
        await page.mouse.click(centre.x, centre.y)
        return page
          .getByTestId('item-kind')
          .textContent({ timeout: 200 })
          .catch(() => null)
      })
      .toBe('Terrace')
  })

  test('saves edits automatically', async ({ page }) => {
    const { at } = await openSample(page)
    const terrace = at(10, 7.5)
    await page.mouse.click(terrace.x, terrace.y)
    await page.keyboard.press('Shift+ArrowRight')
    await page.keyboard.press('Shift+ArrowRight')
    await page.getByRole('textbox', { name: 'Label', exact: true }).fill('Sunny terrace')
    await expect(page.getByRole('status').filter({ hasText: /saved/ })).toHaveText(
      'All changes saved',
    )

    await page.reload()
    await expect(page.getByTestId('garden-canvas').locator('canvas').first()).toBeVisible()
    const moved = at(12, 7.5)
    await page.mouse.click(moved.x, moved.y)
    await expect(page.getByTestId('item-position')).toHaveText('x 12.00 m · y 7.50 m')
    await expect(page.getByRole('textbox', { name: 'Label', exact: true })).toHaveValue(
      'Sunny terrace',
    )
  })

  test('shows the keyboard shortcuts', async ({ page }) => {
    await openSample(page)
    await page.keyboard.press('?')
    const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Zoom to fit')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()

    await page.getByRole('button', { name: 'Keyboard shortcuts' }).click()
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).toBeHidden()
  })
})
