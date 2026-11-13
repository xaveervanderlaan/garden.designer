import { describe, expect, it } from 'vitest'
import { comboLabel, findShortcut, isTypingTarget, shortcutLabel } from './shortcuts'

const key = (
  k: string,
  mods: Partial<Record<'ctrl' | 'meta' | 'shift' | 'alt', boolean>> = {},
) => ({
  key: k,
  ctrlKey: !!mods.ctrl,
  metaKey: !!mods.meta,
  shiftKey: !!mods.shift,
  altKey: !!mods.alt,
})

describe('findShortcut', () => {
  it.each([
    [key('z', { ctrl: true }), 'undo'],
    [key('z', { meta: true }), 'undo'],
    [key('Z', { ctrl: true, shift: true }), 'redo'],
    [key('y', { ctrl: true }), 'redo'],
    [key('c', { ctrl: true }), 'copy'],
    [key('v', { meta: true }), 'paste'],
    [key('v'), 'toolSelect'],
    [key('d', { ctrl: true }), 'duplicate'],
    [key('a', { ctrl: true }), 'selectAll'],
    [key('Delete'), 'delete'],
    [key('Backspace'), 'delete'],
    [key('Escape'), 'clearSelection'],
    [key('ArrowLeft'), 'nudge'],
    [key('ArrowUp', { shift: true }), 'nudgeLarge'],
    [key('+', { shift: true }), 'zoomIn'],
    [key('='), 'zoomIn'],
    [key('-'), 'zoomOut'],
    [key('0'), 'zoomFit'],
    [key('h'), 'toolPan'],
    [key('?', { shift: true }), 'help'],
  ] as const)('%j → %s', (event, expected) => {
    expect(findShortcut(event)).toBe(expected)
  })

  it.each([
    key('z'),
    key('x', { ctrl: true }),
    key('ArrowLeft', { ctrl: true }),
    key('a', { alt: true }),
  ])('ignores %j', (event) => {
    expect(findShortcut(event)).toBeUndefined()
  })
})

describe('labels', () => {
  it('shows platform-specific modifiers', () => {
    expect(comboLabel({ key: 'z', mod: true, shift: true }, false)).toEqual(['Ctrl', 'Shift', 'Z'])
    expect(comboLabel({ key: 'z', mod: true, shift: true }, true)).toEqual(['⌘', '⇧', 'Z'])
    expect(comboLabel({ key: 'ArrowLeft' }, false)).toEqual(['←'])
    expect(shortcutLabel('undo', false)).toBe('Ctrl+Z')
    expect(shortcutLabel('undo', true)).toBe('⌘Z')
  })
})

describe('isTypingTarget', () => {
  it('recognises form fields', () => {
    expect(isTypingTarget(document.createElement('input'))).toBe(true)
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true)
    expect(isTypingTarget(document.createElement('button'))).toBe(false)
    expect(isTypingTarget(document.body)).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })
})
