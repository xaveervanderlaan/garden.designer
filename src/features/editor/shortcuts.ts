import { useEffect } from 'react'
import { useUiStore } from '../../store/uiStore'
import { NUDGE_LARGE_M, NUDGE_SMALL_M, editorActions } from './actions'

/** A key combination. `mod` = Ctrl, or ⌘ on a Mac. Unset `shift` means "with or without Shift". */
export type KeyCombo = { key: string; mod?: boolean; shift?: boolean; alt?: boolean }

export type ShortcutId =
  | 'undo'
  | 'redo'
  | 'copy'
  | 'paste'
  | 'duplicate'
  | 'selectAll'
  | 'delete'
  | 'clearSelection'
  | 'nudge'
  | 'nudgeLarge'
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomFit'
  | 'toolSelect'
  | 'toolPan'
  | 'measure'
  | 'drawPlot'
  | 'rectanglePlot'
  | 'drawBed'
  | 'addStructure'
  | 'addSurface'
  | 'addBoundary'
  | 'addExtra'
  | 'editCorners'
  | 'bringForward'
  | 'sendBackward'
  | 'bringToFront'
  | 'sendToBack'
  | 'snapToGrid'
  | 'help'

export type Shortcut = { id: ShortcutId; combos: KeyCombo[] }

const ARROWS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'] as const

/** The single source for keyboard shortcuts: used for handling keys and for the help overlay. */
export const SHORTCUTS: readonly Shortcut[] = [
  { id: 'undo', combos: [{ key: 'z', mod: true, shift: false }] },
  {
    id: 'redo',
    combos: [
      { key: 'z', mod: true, shift: true },
      { key: 'y', mod: true },
    ],
  },
  { id: 'copy', combos: [{ key: 'c', mod: true }] },
  { id: 'paste', combos: [{ key: 'v', mod: true }] },
  { id: 'duplicate', combos: [{ key: 'd', mod: true }] },
  { id: 'selectAll', combos: [{ key: 'a', mod: true }] },
  { id: 'delete', combos: [{ key: 'Delete' }, { key: 'Backspace' }] },
  { id: 'clearSelection', combos: [{ key: 'Escape' }] },
  { id: 'nudge', combos: ARROWS.map((key) => ({ key, shift: false })) },
  { id: 'nudgeLarge', combos: ARROWS.map((key) => ({ key, shift: true })) },
  { id: 'zoomIn', combos: [{ key: '+' }, { key: '=' }] },
  { id: 'zoomOut', combos: [{ key: '-' }] },
  { id: 'zoomFit', combos: [{ key: '0' }] },
  { id: 'toolSelect', combos: [{ key: 'v' }] },
  { id: 'toolPan', combos: [{ key: 'h' }] },
  { id: 'measure', combos: [{ key: 'm' }] },
  { id: 'drawPlot', combos: [{ key: 'p' }] },
  { id: 'rectanglePlot', combos: [{ key: 'r' }] },
  { id: 'drawBed', combos: [{ key: 'b' }] },
  { id: 'addStructure', combos: [{ key: 's' }] },
  { id: 'addSurface', combos: [{ key: 't' }] },
  { id: 'addBoundary', combos: [{ key: 'f' }] },
  { id: 'addExtra', combos: [{ key: 'w' }] },
  { id: 'editCorners', combos: [{ key: 'e' }] },
  {
    id: 'bringForward',
    combos: [
      { key: ']', mod: true, shift: false },
      { key: 'PageUp', shift: false },
    ],
  },
  {
    id: 'sendBackward',
    combos: [
      { key: '[', mod: true, shift: false },
      { key: 'PageDown', shift: false },
    ],
  },
  { id: 'bringToFront', combos: [{ key: 'PageUp', shift: true }, { key: 'Home' }] },
  { id: 'sendToBack', combos: [{ key: 'PageDown', shift: true }, { key: 'End' }] },
  { id: 'snapToGrid', combos: [{ key: 'g' }] },
  { id: 'help', combos: [{ key: '?' }] },
]

type KeyEventLike = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>

export function matchesCombo(event: KeyEventLike, combo: KeyCombo): boolean {
  return (
    event.key.toLowerCase() === combo.key.toLowerCase() &&
    (event.ctrlKey || event.metaKey) === !!combo.mod &&
    event.altKey === !!combo.alt &&
    (combo.shift === undefined || event.shiftKey === combo.shift)
  )
}

export function findShortcut(
  event: KeyEventLike,
  shortcuts: readonly Shortcut[] = SHORTCUTS,
): ShortcutId | undefined {
  return shortcuts.find((s) => s.combos.some((combo) => matchesCombo(event, combo)))?.id
}

/** Typing in a form field must never trigger editor shortcuts. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  )
}

export const isMac = () =>
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent)

const KEY_LABELS: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Escape: 'Esc',
  Delete: 'Del',
  Backspace: '⌫',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
}

/** Keys of a combo for display, e.g. ["Ctrl", "Shift", "Z"] or ["⌘", "⇧", "Z"]. */
export function comboLabel(combo: KeyCombo, mac = isMac()): string[] {
  const keys: string[] = []
  if (combo.mod) keys.push(mac ? '⌘' : 'Ctrl')
  if (combo.alt) keys.push(mac ? '⌥' : 'Alt')
  if (combo.shift) keys.push(mac ? '⇧' : 'Shift')
  keys.push(KEY_LABELS[combo.key] ?? (combo.key.length === 1 ? combo.key.toUpperCase() : combo.key))
  return keys
}

export function shortcutLabel(id: ShortcutId, mac = isMac()): string {
  const combo = SHORTCUTS.find((s) => s.id === id)?.combos[0]
  return combo ? comboLabel(combo, mac).join(mac ? '' : '+') : ''
}

function nudge(event: KeyboardEvent, step: number): void {
  const delta: Record<string, [number, number]> = {
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
    ArrowUp: [0, -step],
    ArrowDown: [0, step],
  }
  const [dx, dy] = delta[event.key] ?? [0, 0]
  editorActions.nudge(dx, dy)
}

const HANDLERS: Record<ShortcutId, (event: KeyboardEvent) => void> = {
  undo: () => editorActions.undo(),
  redo: () => editorActions.redo(),
  copy: () => editorActions.copy(),
  paste: () => editorActions.paste(),
  duplicate: () => editorActions.duplicate(),
  selectAll: () => editorActions.selectAll(),
  delete: () => editorActions.deleteSelection(),
  clearSelection: () => editorActions.escape(),
  nudge: (e) => nudge(e, NUDGE_SMALL_M),
  nudgeLarge: (e) => nudge(e, NUDGE_LARGE_M),
  zoomIn: () => editorActions.zoomIn(),
  zoomOut: () => editorActions.zoomOut(),
  zoomFit: () => editorActions.zoomToFit(),
  toolSelect: () => editorActions.setTool('select'),
  toolPan: () => editorActions.setTool('pan'),
  measure: () => editorActions.startMeasure(),
  drawPlot: () => editorActions.setTool('draw'),
  rectanglePlot: () => useUiStore.getState().setRectangleDialogOpen(true),
  drawBed: () => editorActions.drawBed('bed-ornamental'),
  addStructure: () => useUiStore.getState().setObjectMenuOpen('structures'),
  addSurface: () => useUiStore.getState().setObjectMenuOpen('surfaces'),
  addBoundary: () => useUiStore.getState().setObjectMenuOpen('boundaries'),
  addExtra: () => useUiStore.getState().setObjectMenuOpen('extras'),
  editCorners: () => editorActions.toggleCornerEditing(),
  bringForward: () => editorActions.reorder('forward'),
  sendBackward: () => editorActions.reorder('backward'),
  bringToFront: () => editorActions.reorder('front'),
  sendToBack: () => editorActions.reorder('back'),
  snapToGrid: () => editorActions.toggleSnapToGrid(),
  help: () => useUiStore.getState().setHelpOpen(true),
}

/** Handles editor shortcuts while the editor is mounted. */
export function useEditorShortcuts(): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || isTypingTarget(event.target)) return
      const {
        helpOpen,
        rectangleDialogOpen,
        sitePlanDialogOpen,
        settingsOpen,
        exportOpen,
        ideasOpen,
        objectMenuOpen,
        drawing,
        calibration,
      } = useUiStore.getState()
      // Dialogs (and the structures menu) handle their own keys.
      if (
        helpOpen ||
        rectangleDialogOpen ||
        sitePlanDialogOpen ||
        settingsOpen ||
        exportOpen ||
        ideasOpen ||
        objectMenuOpen !== null
      ) {
        return
      }
      // While drawing or calibrating, digits are lengths for the panel below the plan, not
      // shortcuts (e.g. 0 = zoom to fit).
      if ((drawing || calibration) && /^[0-9.,]$/.test(event.key)) return
      const id = findShortcut(event)
      if (!id) return
      event.preventDefault() // e.g. keep Ctrl+D from bookmarking and arrows from scrolling
      HANDLERS[id](event)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
