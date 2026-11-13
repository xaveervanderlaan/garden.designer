import { type Page, expect, test } from '@playwright/test'

/** Fails the test if the page logs any console error or throws. */
function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))
  return errors
}

test.describe('app shell', () => {
  test('loads the project list in English', async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto('./')

    await expect(page).toHaveTitle('Garden Designer')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your garden designs')
    expect(errors).toEqual([])
  })

  test('switches to Dutch and keeps it after a reload', async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto('./')

    await page.getByRole('button', { name: 'NL' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Jouw tuinontwerpen')
    await expect(page.locator('html')).toHaveAttribute('lang', 'nl')

    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Jouw tuinontwerpen')
    await expect(page).toHaveTitle('Tuinontwerper')
    expect(errors).toEqual([])
  })

  test('navigates to the editor placeholder and back', async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto('./')

    await page.getByRole('link', { name: 'Preview the editor' }).click()
    await expect(page).toHaveURL(/#\/p\/demo$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Garden editor')

    await page.getByRole('link', { name: 'Back to your designs' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your garden designs')

    await page.goBack()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Garden editor')
    expect(errors).toEqual([])
  })

  test('shows not found for unknown routes', async ({ page }) => {
    await page.goto('./#/nope')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found')
  })
})

test.describe('Dutch browser', () => {
  test.use({ locale: 'nl-NL' })

  test('starts in Dutch when the browser language is Dutch', async ({ page }) => {
    await page.goto('./')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Jouw tuinontwerpen')
    await expect(page.getByRole('button', { name: 'NL' })).toHaveAttribute('aria-pressed', 'true')
  })
})
