import { readdirSync } from 'node:fs'
import { relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Page, expect, test } from '@playwright/test'

function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()))
  page.on('pageerror', (err) => errors.push(err.message))
  return errors
}

const DIST = fileURLToPath(new URL('../../dist/', import.meta.url))

/** Every file of the build the app may load: all but licence texts and the service worker itself. */
function builtFiles(): string[] {
  return readdirSync(DIST, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(DIST, `${entry.parentPath}/${entry.name}`).replaceAll('\\', '/'))
    .filter((path) => !/(^|\/)LICENSE[^/]*$/.test(path))
    .filter((path) => path !== 'sw.js' && !/^workbox-[\w-]+\.js$/.test(path))
    .sort()
}

/** Waits until the service worker has precached the app and controls the page. */
async function waitUntilOfflineReady(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
}

/** The precached files, as paths relative to the app's base URL. */
function precachedFiles(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const { scope } = await navigator.serviceWorker.ready
    const name = (await caches.keys()).find((key) => key.includes('precache'))
    if (!name) return []
    const requests = await (await caches.open(name)).keys()
    return requests
      .map((request) => {
        const url = new URL(request.url)
        url.searchParams.delete('__WB_REVISION__')
        return url.href.slice(scope.length)
      })
      .sort()
  })
}

/**
 * A one-page PDF with a line of text in Helvetica, a standard font that isn't embedded: pdf.js
 * loads it from the app's own files.
 */
function onePagePdf(): Buffer {
  const content = '0.2 0.6 0.2 rg 0 0 200 100 re f 1 1 1 rg BT /F1 12 Tf 8 8 Td (Offline) Tj ET'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] ' +
      '/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = objects.map((object, i) => {
    const offset = pdf.length
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`
    return offset
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  pdf += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(pdf, 'latin1')
}

test.describe('installable app (PWA)', () => {
  test('the service worker precaches every file of the build', async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto('./')
    await waitUntilOfflineReady(page)

    const files = builtFiles()
    expect(files).toEqual(expect.arrayContaining(['index.html', 'manifest.webmanifest']))
    expect(files.some((file) => /^assets\/pdf\.worker.*\.mjs$/.test(file))).toBe(true)
    expect(files.some((file) => file.startsWith('pdfjs/standard_fonts/'))).toBe(true)
    expect(await precachedFiles(page)).toEqual(files)
    expect(errors).toEqual([])
  })

  test('works offline: designs, the editor, the plant library and PDF site plans', async ({
    page,
    context,
    baseURL,
  }) => {
    const errors = collectErrors(page)
    await page.goto('./')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your garden designs')
    await waitUntilOfflineReady(page)

    await context.setOffline(true)
    expect(await page.evaluate(() => navigator.onLine)).toBe(false)
    // Every request for the app's own files must now be answered by the service worker.
    const notFromCache: string[] = []
    page.on('response', (response) => {
      if (response.url().startsWith(baseURL!) && !response.fromServiceWorker()) {
        notFromCache.push(response.url())
      }
    })

    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your garden designs')
    await expect(page.getByText('No designs yet.')).toBeVisible()

    // A new design opens in the editor, with the (lazily loaded) canvas.
    await page.getByRole('button', { name: 'New design' }).click()
    await page.getByRole('textbox', { name: 'Name of the new design' }).fill('Offline garden')
    await page.getByRole('button', { name: 'Create' }).click()
    await expect(page.getByRole('textbox', { name: 'Design name' })).toHaveValue('Offline garden')
    await expect(page.getByTestId('garden-canvas').locator('canvas').first()).toBeVisible()

    // The plant library searches the built-in plants.
    await page.getByRole('searchbox', { name: 'Search plants' }).fill('lavendel')
    await expect(
      page.getByRole('list', { name: 'Plants' }).getByRole('button').first(),
    ).toContainText('Lavandula angustifolia')

    // A PDF site plan: pdf.js, its worker and the standard fonts come from the cache.
    await page.getByTestId('site-plan-input').setInputFiles({
      name: 'site-plan.pdf',
      mimeType: 'application/pdf',
      buffer: onePagePdf(),
    })
    await expect(page.getByTestId('calibration-panel')).toBeVisible()
    await page.keyboard.press('Escape')

    // Saved locally: still there after another offline reload.
    await expect(page.getByRole('status').filter({ hasText: /saved/ })).toHaveText(
      'All changes saved',
    )
    await page.getByRole('link', { name: 'Back to your designs' }).click()
    await page.reload()
    await expect(page.getByRole('link', { name: 'Offline garden', exact: true })).toBeVisible()

    expect(notFromCache).toEqual([])
    expect(errors).toEqual([])
  })

  test('is installable: manifest, icons and the iOS home screen icon', async ({ page }) => {
    await page.goto('./')
    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href')
    expect(manifestHref).toBe('/garden.designer/manifest.webmanifest')

    const manifest = await page.evaluate(async (href) => (await fetch(href)).json(), manifestHref!)
    expect(manifest).toMatchObject({
      name: 'Garden Designer',
      start_url: '/garden.designer/',
      scope: '/garden.designer/',
      display: 'standalone',
    })

    // Each icon loads and has the size the manifest says.
    const icons: Array<{ src: string; sizes: string }> = [
      ...manifest.icons,
      {
        src: (await page.locator('link[rel="apple-touch-icon"]').getAttribute('href'))!,
        sizes: '180x180',
      },
    ]
    expect(icons.some((icon) => /maskable/.test(JSON.stringify(icon)))).toBe(true)
    for (const icon of icons) {
      const size = await page.evaluate(async (src) => {
        const image = new Image()
        image.src = new URL(src, new URL('manifest.webmanifest', document.baseURI)).href
        await image.decode()
        return `${image.naturalWidth}x${image.naturalHeight}`
      }, icon.src)
      expect(size, icon.src).toBe(icon.sizes)
    }
  })

  test('offers a new version and reloads into it', async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto('./')
    await waitUntilOfflineReady(page)

    // Simulate a deploy: the same worker under another URL counts as a new version. (After the
    // reload, the app registers sw.js again, which is "new" once more; that's an artefact.)
    await page.evaluate(() => navigator.serviceWorker.register('sw.js?next', { scope: './' }))
    const prompt = page.getByRole('status').filter({ hasText: 'A new version of the app' })
    await expect(prompt).toBeVisible()

    const reloaded = page.waitForEvent('load')
    await prompt.getByRole('button', { name: 'Reload' }).click()
    await reloaded
    expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toMatch(
      /\/sw\.js\?next$/,
    )
    expect(errors).toEqual([])
  })
})
