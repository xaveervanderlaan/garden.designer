import { describe, expect, it, vi } from 'vitest'
import type { Proposal } from '../../../proposals/format'
import { sampleProjectWithAsset } from '../../../test/fixtures'
import { createThumbnailCache, thumbnailKey } from './thumbnails'

function deferred() {
  let resolve!: (blob: Blob) => void
  const promise = new Promise<Blob>((r) => (resolve = r))
  return { promise, resolve: () => resolve(new Blob(['png'])) }
}

function setup(max = 60) {
  let n = 0
  const revoked: string[] = []
  const cache = createThumbnailCache({
    max,
    createUrl: () => `blob:${++n}`,
    revokeUrl: (url) => revoked.push(url),
    yieldFn: () => Promise.resolve(),
  })
  return { cache, revoked }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('thumbnail cache', () => {
  it('renders one job at a time', async () => {
    const { cache } = setup()
    const jobs = [deferred(), deferred(), deferred()]
    const makes = jobs.map((job) => vi.fn(() => job.promise))
    const urls = makes.map((make, i) => cache.request(`k${i}`, make))
    await flush()
    expect(makes.map((m) => m.mock.calls.length)).toEqual([1, 0, 0])
    jobs[0]!.resolve()
    expect(await urls[0]).toBe('blob:1')
    await flush()
    expect(makes.map((m) => m.mock.calls.length)).toEqual([1, 1, 0])
    jobs[1]!.resolve()
    jobs[2]!.resolve()
    expect(await Promise.all(urls)).toEqual(['blob:1', 'blob:2', 'blob:3'])
  })

  it('reuses a cached thumbnail', async () => {
    const { cache } = setup()
    const make = vi.fn(() => Promise.resolve(new Blob(['png'])))
    const first = cache.request('a', make)
    expect(cache.request('a', make)).toBe(first)
    expect(await first).toBe('blob:1')
    expect(await cache.request('a', make)).toBe('blob:1')
    expect(cache.get('a')).toBe('blob:1')
    expect(make).toHaveBeenCalledTimes(1)
  })

  it('evicts the oldest and revokes its URL', async () => {
    const { cache, revoked } = setup(2)
    const make = () => Promise.resolve(new Blob(['png']))
    await cache.request('a', make)
    await cache.request('b', make)
    cache.get('a') // a is now the most recently used
    await cache.request('c', make)
    expect(revoked).toEqual(['blob:2'])
    expect(cache.get('b')).toBeUndefined()
    expect(cache.get('a')).toBe('blob:1')
    expect(cache.get('c')).toBe('blob:3')
  })

  it('clear drops queued jobs', async () => {
    const { cache, revoked } = setup()
    await cache.request('done', () => Promise.resolve(new Blob(['png'])))
    const running = deferred()
    const queued = vi.fn(() => Promise.resolve(new Blob(['png'])))
    const first = cache.request('a', () => running.promise)
    const second = cache.request('b', queued)
    await flush()
    cache.clear()
    expect(revoked).toEqual(['blob:1'])
    await expect(second).rejects.toThrow('cleared')
    running.resolve()
    await expect(first).rejects.toThrow('cleared')
    expect(revoked).toEqual(['blob:1', 'blob:2'])
    expect(queued).not.toHaveBeenCalled()
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('done')).toBeUndefined()
  })

  it('key changes with the proposal and the design', () => {
    const { project } = sampleProjectWithAsset()
    const proposal: Proposal = {
      id: 'A',
      title: 'Terrace',
      concept: '',
      tags: [],
      highlights: [],
      elements: [],
    }
    const key = thumbnailKey(project, proposal)
    expect(thumbnailKey(project, { ...proposal })).toBe(key)
    expect(thumbnailKey(project, { ...proposal, title: 'Pond' })).not.toBe(key)
    expect(thumbnailKey({ ...project, updatedAt: project.updatedAt + 1 }, proposal)).not.toBe(key)
    expect(thumbnailKey({ ...project, id: 'other' }, proposal)).not.toBe(key)
  })
})
