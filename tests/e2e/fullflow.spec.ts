import { type Page, expect, test } from '@playwright/test'
import {
  BAR_PX,
  PLOT_PX,
  type Point,
  type SavedProject,
  collectErrors,
  imageOnScreen,
  openPlant,
  savedAssetIds,
  savedProject,
  savedProjects,
  sitePlanPng,
} from './helpers.ts'

const plantingTotal = (page: Page) =>
  page.getByRole('region', { name: /^Planting list/ }).getByTestId('planting-total')

/** The design's content, without what an import is meant to change (ids, timestamps). */
function content(project: SavedProject) {
  const { assetId, ...background }: Record<string, unknown> = project.background ?? {}
  return {
    assetId,
    background,
    plot: project.plot,
    objects: project.objects,
    plantings: project.plantings,
  }
}

test('designs a garden from site plan to plants, and the exported file imports intact', async ({
  page,
}, testInfo) => {
  test.slow()
  const errors = collectErrors(page)

  // A new design.
  await page.goto('./')
  await page.getByRole('button', { name: 'New design' }).click()
  await page.getByRole('textbox', { name: 'Name of the new design' }).fill('Full flow')
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByTestId('garden-canvas').locator('canvas').first()).toBeVisible()

  // Import the site plan; calibrating starts by itself.
  const png = await sitePlanPng(page)
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('toolbar').getByRole('button', { name: 'Import site plan' }).click()
  await (await chooser).setFiles({ name: 'site-plan.png', mimeType: 'image/png', buffer: png })
  const calibration = page.getByTestId('calibration-panel')
  await expect(calibration.getByRole('status')).toContainText('click the start of a distance')

  // Calibrate with the 10 m scale bar.
  let bg = (await savedProject(page)).background!
  let at = await imageOnScreen(page, bg)
  for (const end of [BAR_PX.from, BAR_PX.to]) {
    const p = at(end)
    await page.mouse.click(p.x, p.y)
  }
  await expect(calibration.getByRole('status')).toHaveText(
    'Type the real distance and press Enter.',
  )
  await page.keyboard.type('10')
  await page.keyboard.press('Enter')
  await expect(calibration).toBeHidden()
  await expect(page.getByTestId('site-plan-calibration')).toHaveText('10.00 m')
  bg = (await savedProject(page)).background!
  expect(Math.abs(bg.metresPerPixel / 0.05 - 1)).toBeLessThan(0.01)

  // Lock it and trace the plot by clicking its corners: about 25 × 15 m.
  await page.getByRole('button', { name: 'Lock in place' }).click()
  await page.keyboard.press('p')
  const drawingPanel = page.getByTestId('drawing-panel')
  await expect(drawingPanel).toBeVisible()
  at = await imageOnScreen(page, bg)
  const { left, top, right, bottom } = PLOT_PX
  for (const corner of [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
    { x: left, y: top }, // closes the outline
  ]) {
    const p = at(corner)
    await page.mouse.click(p.x, p.y)
  }
  await expect(drawingPanel).toBeHidden()
  const plotArea = Number(
    (await page.getByTestId('plot-area').textContent())!.replace(/[^0-9.]/g, ''),
  )
  // A tolerance of 1%: the clicks land within about half an image pixel.
  expect(Math.abs(plotArea / (500 * 300 * bg.metresPerPixel ** 2) - 1)).toBeLessThan(0.01)

  // The clicks ended the fitted view, so `at` stays valid while panels open and close below the
  // plan (the plan's top-left corner doesn't move). A 6 × 3 m ornamental bed with typed lengths,
  // from 5 m right and 3.5 m below the plot's top-left corner (image pixel 150, 120).
  await page.getByRole('toolbar').getByRole('button', { name: 'Draw ornamental bed' }).click()
  await expect(drawingPanel).toContainText('Ornamental bed:')
  const length = page.getByRole('textbox', { name: 'Length' })
  const angle = page.getByRole('textbox', { name: 'Angle' })
  const bedStart: Point = { x: 150, y: 120 }
  const start = at(bedStart)
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

  // Stamp two catmints inside the bed (20 image pixels = 1 m), then stop with Escape.
  await openPlant(page, 'catmint')
  await page.getByRole('button', { name: 'Place', exact: true }).click()
  await expect(page.getByTestId('stamp-panel')).toBeVisible()
  for (const dx of [40, 80]) {
    const p = at({ x: bedStart.x + dx, y: bedStart.y + 20 })
    await page.mouse.click(p.x, p.y)
  }
  await expect(page.getByTestId('stamp-count')).toHaveText('2 placed')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('stamp-panel')).toBeHidden()

  // Fill the bed with stonecrop around them.
  await openPlant(page, 'autumn joy')
  await page.getByRole('button', { name: 'Fill bed' }).click()
  const fillPanel = page.getByTestId('fill-panel')
  await expect(fillPanel).toContainText('Ornamental bed 1')
  const filled = Number((await page.getByTestId('fill-count').textContent())!.replace(/\D/g, ''))
  expect(filled).toBeGreaterThan(40)
  await fillPanel.getByRole('button', { name: 'Fill bed' }).click()
  await expect(fillPanel).toBeHidden()
  const total = `${2 + filled} plants in total`
  await expect(plantingTotal(page)).toHaveText(total)
  const list = page.getByRole('region', { name: /^Planting list/ })
  await list.getByRole('button', { name: 'Per bed' }).click()
  await expect(list.getByRole('heading', { level: 3 })).toHaveText([
    `Ornamental bed 1${2 + filled}`,
  ])

  // Saved; back to the list and export the design.
  const original = await savedProject(page)
  expect(original.plantings).toHaveLength(2 + filled)
  await page.getByRole('link', { name: 'Back to your designs' }).click()
  const downloading = page.waitForEvent('download')
  await page
    .getByRole('listitem')
    .filter({ has: page.getByRole('link', { name: 'Full flow', exact: true }) })
    .getByRole('button', { name: 'Export' })
    .click()
  const download = await downloading
  expect(download.suggestedFilename()).toBe('full-flow.garden.json')
  const exportPath = testInfo.outputPath('full-flow.garden.json')
  await download.saveAs(exportPath)

  // Import it: a second design with new ids and the same content, site plan image included.
  await page.getByTestId('import-input').setInputFiles(exportPath)
  await expect(page.getByRole('status')).toContainText('Imported “Full flow”.')
  await expect(page.getByRole('listitem')).toHaveCount(2)
  const projects = await savedProjects(page)
  expect(projects).toHaveLength(2)
  const imported = projects.find((project) => project.id !== original.id)!
  expect(imported.name).toBe('Full flow')
  const { assetId: originalAsset, ...originalContent } = content(original)
  const { assetId: importedAsset, ...importedContent } = content(imported)
  expect(importedContent).toEqual(originalContent)
  expect(importedAsset).toEqual(expect.any(String))
  expect(importedAsset).not.toBe(originalAsset)
  expect(await savedAssetIds(page)).toEqual(expect.arrayContaining([originalAsset, importedAsset]))

  // Open it: all plants are there.
  await page.locator(`a[href$="#/p/${imported.id}"]`).click()
  await expect(page.getByRole('textbox', { name: 'Design name' })).toHaveValue('Full flow')
  await expect(plantingTotal(page)).toHaveText(total)
  await expect(page.getByTestId('garden-canvas').locator('canvas').first()).toBeVisible()

  expect(errors).toEqual([])
})
