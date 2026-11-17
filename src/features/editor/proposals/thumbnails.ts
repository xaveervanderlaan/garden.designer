import { useEffect, useState } from 'react'
import { designBounds } from '../../../export/exportOptions'
import { fitBounds } from '../../../geometry/viewport'
import { currentLanguage } from '../../../i18n'
import type { Project } from '../../../model/schema'
import type { Proposal } from '../../../proposals/format'
import { fingerprint } from '../../../proposals/fingerprint'
import { withLayerVisibility } from '../../viewer/viewerLayers'

/** A thumbnail's size in layout pixels (drawn at up to twice that for sharp screens). */
export const THUMB_SIZE = { width: 240, height: 160 }

export type ThumbnailCache = {
  /** The object URL of a finished thumbnail (and marks it as recently used). */
  get(key: string): string | undefined
  /** Renders a thumbnail once; jobs run one at a time, in the order requested. */
  request(key: string, make: () => Promise<Blob>): Promise<string>
  /** Drops queued jobs and revokes every URL. */
  clear(): void
}

type Job = {
  key: string
  make: () => Promise<Blob>
  resolve: (url: string) => void
  reject: (error: unknown) => void
}

const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

/**
 * An in-memory LRU of thumbnail object URLs with a queue that renders one at a time and yields to
 * the browser between jobs, so a gallery of thumbnails never freezes the page.
 */
export function createThumbnailCache({
  max = 60,
  createUrl = (blob: Blob) => URL.createObjectURL(blob),
  revokeUrl = (url: string) => URL.revokeObjectURL(url),
  yieldFn = nextTask,
}: {
  max?: number
  createUrl?: (blob: Blob) => string
  revokeUrl?: (url: string) => void
  yieldFn?: () => Promise<void>
} = {}): ThumbnailCache {
  const urls = new Map<string, string>()
  const pending = new Map<string, Promise<string>>()
  let queue: Job[] = []
  let running = false
  let generation = 0

  function store(key: string, url: string) {
    urls.set(key, url)
    for (const [oldKey, oldUrl] of urls) {
      if (urls.size <= max) break
      urls.delete(oldKey)
      revokeUrl(oldUrl)
    }
  }

  async function pump() {
    if (running) return
    running = true
    while (queue.length > 0) {
      const job = queue.shift()!
      const gen = generation
      try {
        const blob = await job.make()
        const url = createUrl(blob)
        if (gen !== generation) {
          revokeUrl(url)
          job.reject(new Error('Thumbnail cache cleared'))
        } else {
          store(job.key, url)
          job.resolve(url)
        }
      } catch (error) {
        job.reject(error)
      } finally {
        if (gen === generation) pending.delete(job.key)
      }
      await yieldFn()
    }
    running = false
  }

  return {
    get(key) {
      const url = urls.get(key)
      if (url !== undefined) {
        urls.delete(key)
        urls.set(key, url)
      }
      return url
    },
    request(key, make) {
      const url = this.get(key)
      if (url !== undefined) return Promise.resolve(url)
      const waiting = pending.get(key)
      if (waiting) return waiting
      const promise = new Promise<string>((resolve, reject) => {
        queue.push({ key, make, resolve, reject })
      })
      pending.set(key, promise)
      void pump()
      return promise
    },
    clear() {
      generation++
      const dropped = queue
      queue = []
      pending.clear()
      for (const job of dropped) job.reject(new Error('Thumbnail cache cleared'))
      for (const url of urls.values()) revokeUrl(url)
      urls.clear()
    },
  }
}

/** The gallery's thumbnails, kept while the app runs. */
export const thumbnailCache = createThumbnailCache()

/** Changes when the proposal or the design it builds on changes. */
export function thumbnailKey(project: Project, proposal: Proposal): string {
  return `${project.id}|${project.updatedAt}|${fingerprint(proposal)}`
}

/** Draws a design small, fully grown, without labels, dimensions, site plan or sun, as a PNG. */
export async function renderThumbnail(project: Project): Promise<Blob> {
  const { canvasBlob, renderPlan } = await import('../../../export/renderPlan')
  const shown = withLayerVisibility(project, {
    labels: false,
    measurements: false,
    background: false,
  })
  const canvas = await renderPlan({
    project: shown,
    viewport: fitBounds(designBounds(shown), THUMB_SIZE, 6),
    size: THUMB_SIZE,
    pixelRatio: Math.min(2, window.devicePixelRatio || 1),
    view: { year: 'mature', month: null },
    labelMode: 'name',
    lang: currentLanguage(),
    includeSun: false,
  })
  try {
    return await canvasBlob(canvas, 'image/png')
  } finally {
    canvas.width = 0
    canvas.height = 0
  }
}

/** The thumbnail's URL once it is drawn (null until then); queues it when it isn't cached. */
export function useThumbnail(key: string, project: Project): string | null {
  const [loaded, setLoaded] = useState<{ key: string; url: string } | null>(null)
  const cached = thumbnailCache.get(key)
  useEffect(() => {
    if (thumbnailCache.get(key) !== undefined) return
    let cancelled = false
    thumbnailCache
      .request(key, () => renderThumbnail(project))
      .then(
        (url) => {
          if (!cancelled) setLoaded({ key, url })
        },
        (error: unknown) => {
          if (!cancelled) console.warn('Drawing a thumbnail failed', error)
        },
      )
    return () => {
      cancelled = true
    }
  }, [key, project])
  return cached ?? (loaded?.key === key ? loaded.url : null)
}
