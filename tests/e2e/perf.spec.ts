import { readFileSync, readdirSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { type Page, expect, test } from '@playwright/test'
import { type Plant, SCHEMA_VERSION } from '../../src/model/schema.ts'
import { perfProject } from '../../src/test/perfProject.ts'

/**
 * Performance with a large design (PLAN M7: ~1000 plantings, pan and zoom stay smooth): the time
 * to open it and the frame times while zooming with the wheel and panning by dragging. The
 * numbers are printed and attached to the report; the limits are generous, so the test only
 * fails on a real regression, not on a slow or busy machine.
 */

const PLANTINGS = 1000
/**
 * Limit on the main thread's work per pan or zoom step. The target is to fit in a frame (16.7 ms
 * at 60 fps) on a desktop; CI machines are slower.
 */
const MAX_BUSY_MS_PER_STEP = 50
const MAX_OPEN_MS = 8000

const PLANT_DATA = new URL('../../src/data/plants/', import.meta.url)

/** The built-in plants, read from the JSON files (Playwright can't import JSON modules). */
function builtInPlants(): Plant[] {
  return readdirSync(PLANT_DATA)
    .filter((file) => file.endsWith('.json'))
    .flatMap((file) => JSON.parse(readFileSync(new URL(file, PLANT_DATA), 'utf8')) as Plant[])
}

function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()))
  page.on('pageerror', (err) => errors.push(err.message))
  return errors
}

type Stats = {
  /** Frames drawn (requestAnimationFrame callbacks) and their average, p95 and longest time. */
  frames: number
  averageFrameMs: number
  p95FrameMs: number
  maxFrameMs: number
  /** Main-thread time per pan or zoom step: event handling, React, Konva (Chromium only). */
  busyMsPerStep: number | null
  /** Time spent drawing Konva layers per step. */
  drawMsPerStep: number
}

const round = (ms: number) => Math.round(ms * 10) / 10

/**
 * Runs `steps` pan or zoom steps and measures them: the frame times (rAF to rAF; headless
 * browsers draw frames on demand, so these mostly show long frames), the main thread's busy time
 * and the time Konva spends drawing.
 */
async function measure(
  page: Page,
  steps: number,
  step: (i: number) => Promise<void>,
): Promise<Stats> {
  const cdp =
    page.context().browser()?.browserType().name() === 'chromium'
      ? await page.context().newCDPSession(page)
      : null
  await cdp?.send('Performance.enable')
  const busy = async () => {
    const metrics = (await cdp?.send('Performance.getMetrics'))?.metrics ?? []
    return metrics.find((m) => m.name === 'TaskDuration')?.value ?? 0
  }

  await page.evaluate(() => {
    type Recorder = { frames: number[]; drawMs: number; recording: boolean; wrapped?: boolean }
    const w = window as unknown as { perf: Recorder; Konva: any }
    const recorder: Recorder = { frames: [], drawMs: 0, recording: true, wrapped: w.perf?.wrapped }
    w.perf = recorder
    // Konva puts itself on window; time every layer draw (scene and hit graph).
    if (!recorder.wrapped) {
      const layer = w.Konva.Layer.prototype
      const draw = layer.draw
      layer.draw = function (this: unknown, ...args: unknown[]) {
        const start = performance.now()
        try {
          return draw.apply(this, args)
        } finally {
          w.perf.drawMs += performance.now() - start
        }
      }
      recorder.wrapped = true
    }
    const tick = (time: number) => {
      if (!w.perf.recording) return
      w.perf.frames.push(time)
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  const busyBefore = await busy()
  for (let i = 0; i < steps; i++) await step(i)
  const result = await page.evaluate(
    () =>
      new Promise<{ frames: number[]; drawMs: number }>((resolve) =>
        // Two more frames, so the last change has been drawn.
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const w = window as unknown as {
              perf: { frames: number[]; drawMs: number; recording: boolean }
            }
            w.perf.recording = false
            resolve({ frames: w.perf.frames, drawMs: w.perf.drawMs })
          }),
        ),
      ),
  )
  const busyMs = ((await busy()) - busyBefore) * 1000
  await cdp?.detach()

  const times = result.frames
  const intervals = times.slice(1).map((t, i) => t - times[i]!)
  const sorted = [...intervals].sort((a, b) => a - b)
  return {
    frames: intervals.length,
    averageFrameMs: round((times.at(-1)! - times[0]!) / intervals.length),
    p95FrameMs: round(sorted[Math.floor(sorted.length * 0.95)] ?? 0),
    maxFrameMs: round(sorted.at(-1) ?? 0),
    busyMsPerStep: cdp ? round(busyMs / steps) : null,
    drawMsPerStep: round(result.drawMs / steps),
  }
}

test('a design with 1000 plantings opens quickly and pans and zooms smoothly', async ({
  page,
}, testInfo) => {
  test.slow()
  const errors = collectErrors(page)
  const project = perfProject(builtInPlants(), { plantings: PLANTINGS })
  const file = testInfo.outputPath('perf.garden.json')
  await writeFile(
    file,
    JSON.stringify({
      format: 'garden-designer',
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      project,
      assets: {},
    }),
  )

  await page.goto('./')
  await page.getByTestId('import-input').setInputFiles(file)
  await expect(page.getByRole('status')).toContainText(`Imported “${project.name}”.`)

  // Open it: until the plan and the planting list show the whole design.
  const opening = Date.now()
  await page.getByRole('link', { name: project.name, exact: true }).click()
  await expect(page.getByTestId('planting-total')).toHaveText(`${PLANTINGS} plants in total`)
  await expect(page.getByTestId('garden-canvas').locator('canvas').first()).toBeVisible()
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  )
  const openMs = Date.now() - opening

  const box = (await page.getByTestId('plan-area').boundingBox())!
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await page.mouse.move(centre.x, centre.y)

  // Zoom in and out again with the mouse wheel, from the whole design to close up.
  const zoomLevel = page.getByTestId('zoom-level')
  const fitted = await zoomLevel.textContent()
  const zoom = await measure(page, 60, (i) => page.mouse.wheel(0, i < 30 ? -60 : 60))
  await expect(zoomLevel).toHaveText(fitted!)

  // Pan by dragging with the middle button, back and forth.
  await page.mouse.down({ button: 'middle' })
  const pan = await measure(page, 60, async (i) => {
    const offset = (i < 30 ? i + 1 : 59 - i) * 8
    await page.mouse.move(centre.x + offset, centre.y + offset / 2)
  })
  await page.mouse.up({ button: 'middle' })

  const results = { plantings: PLANTINGS, openMs, zoom, pan }
  console.log(`Performance: ${JSON.stringify(results)}`)
  testInfo.annotations.push({ type: 'performance', description: JSON.stringify(results) })

  expect(openMs).toBeLessThan(MAX_OPEN_MS)
  for (const stats of [zoom, pan]) {
    expect(stats.busyMsPerStep ?? stats.drawMsPerStep).toBeLessThan(MAX_BUSY_MS_PER_STEP)
  }
  expect(errors).toEqual([])
})
