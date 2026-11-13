import { describe, expect, it } from 'vitest'
import { hrefFor, parseHash } from './routing'

describe('parseHash', () => {
  it.each(['', '#', '#/'])('maps %j to the project list', (hash) => {
    expect(parseHash(hash)).toEqual({ name: 'projects' })
  })

  it('maps #/p/<id> to the editor', () => {
    expect(parseHash('#/p/abc123')).toEqual({ name: 'editor', projectId: 'abc123' })
    expect(parseHash('#/p/abc123/')).toEqual({ name: 'editor', projectId: 'abc123' })
  })

  it('decodes percent-encoded project ids', () => {
    expect(parseHash('#/p/back%20garden')).toEqual({ name: 'editor', projectId: 'back garden' })
  })

  it.each(['#/x', '#/p', '#/p/', '#/p/a/b', '#/p/%E0%A4%A'])('maps %j to not found', (hash) => {
    expect(parseHash(hash)).toEqual({ name: 'notFound' })
  })
})

describe('hrefFor', () => {
  it('builds hrefs that parse back to the same route', () => {
    expect(hrefFor({ name: 'projects' })).toBe('#/')
    const route = { name: 'editor', projectId: 'front & back/1' } as const
    expect(parseHash(hrefFor(route))).toEqual(route)
  })
})
