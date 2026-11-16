import { House } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDecimal } from '../../../i18n/units'
import { OBJECT_PALETTE, OBJECT_PRESETS } from '../../../model/objectKinds'
import type { ObjectKind } from '../../../model/schema'
import { useUiStore } from '../../../store/uiStore'
import toolbar from '../EditorPage.module.css'
import { editorActions } from '../actions'
import { shortcutLabel } from '../shortcuts'
import styles from './ObjectMenu.module.css'
import { ObjectSwatch } from './ObjectSwatch'

const STRUCTURES: readonly ObjectKind[] = OBJECT_PALETTE.find(
  (g) => g.group === 'structures',
)!.kinds

/**
 * The toolbar button for adding a structure: a menu of presets (house, shed, …). Choosing one
 * starts drawing it: drag a rectangle, click its corners, or place it at its default size.
 */
export function ObjectMenu() {
  const { t } = useTranslation()
  const open = useUiStore((s) => s.objectMenuOpen)
  const drawing = useUiStore((s) =>
    s.drawing?.target.kind === 'object' ? s.drawing.target.objectKind : null,
  )
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const label = t('editor.objects.add')
  const setOpen = (value: boolean) => useUiStore.getState().setObjectMenuOpen(value)

  useEffect(() => {
    if (!open) return
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (!menu.current?.contains(target) && !button.current?.contains(target)) setOpen(false)
    }
    window.addEventListener('mousedown', onPointerDown)
    return () => window.removeEventListener('mousedown', onPointerDown)
  }, [open])

  function onKeyDown(event: React.KeyboardEvent) {
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    const index = items.indexOf(document.activeElement as HTMLElement)
    const focus = (i: number) => items[(i + items.length) % items.length]?.focus()
    if (event.key === 'ArrowDown') focus(index + 1)
    else if (event.key === 'ArrowUp') focus(index - 1)
    else if (event.key === 'Home') focus(0)
    else if (event.key === 'End') focus(items.length - 1)
    else if (event.key === 'Escape') {
      setOpen(false)
      button.current?.focus()
    } else if (event.key === 'Tab') setOpen(false)
    else return
    if (event.key !== 'Tab') event.preventDefault()
    event.stopPropagation()
  }

  function choose(kind: ObjectKind) {
    setOpen(false)
    editorActions.drawObject(kind)
  }

  return (
    <div className={styles.anchor}>
      <button
        ref={button}
        type="button"
        className={toolbar.toolButton}
        aria-label={label}
        title={`${label} (${shortcutLabel('addStructure')})`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-pressed={drawing !== null && STRUCTURES.includes(drawing)}
        onClick={() => setOpen(!open)}
      >
        <House size={18} aria-hidden />
      </button>
      {open && (
        <div
          ref={menu}
          id={menuId}
          className={styles.menu}
          role="menu"
          aria-label={t('editor.objects.menu')}
          onKeyDown={onKeyDown}
        >
          <p className={styles.menuTitle} aria-hidden>
            {t('editor.objects.menu')}
          </p>
          {STRUCTURES.map((kind) => {
            const size = OBJECT_PRESETS[kind].sizeM
            return (
              <button
                key={kind}
                type="button"
                role="menuitem"
                className={styles.item}
                onClick={() => choose(kind)}
              >
                <ObjectSwatch kind={kind} />
                <span className={styles.itemName}>{t(`editor.objectKinds.${kind}`)}</span>
                {size && (
                  <span className={styles.itemSize}>
                    {t('editor.objects.sizeValue', {
                      width: formatDecimal(size.width, 1),
                      depth: formatDecimal(size.depth, 1),
                    })}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
