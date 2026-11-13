import { describe, expect, it } from 'vitest'
import en from './locales/en.json'
import nl from './locales/nl.json'

type Tree = { [key: string]: string | Tree }

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') out.set(path, value)
    else for (const [k, v] of flatten(value, path)) out.set(k, v)
  }
  return out
}

const placeholders = (s: string) => [...s.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]).sort()

describe('locale files', () => {
  const enKeys = flatten(en)
  const nlKeys = flatten(nl)

  it('have exactly the same keys in English and Dutch', () => {
    expect([...nlKeys.keys()].sort()).toEqual([...enKeys.keys()].sort())
  })

  it('have no empty translations', () => {
    for (const [key, value] of [...enKeys, ...nlKeys]) {
      expect(value.trim(), key).not.toBe('')
    }
  })

  it('use the same {{placeholders}} in both languages', () => {
    for (const [key, value] of enKeys) {
      expect(placeholders(nlKeys.get(key) ?? ''), key).toEqual(placeholders(value))
    }
  })
})
