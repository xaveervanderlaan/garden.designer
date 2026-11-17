import { Droplets, Fence, Grid2x2, House } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDecimal } from '../../../i18n/units'
import {
  OBJECT_PALETTE,
  OBJECT_PRESETS,
  type PaletteGroup,
  type SymbolVariantId,
  SYMBOL_VARIANTS,
} from '../../../model/objectKinds'
import type { ObjectKind } from '../../../model/schema'
import { useUiStore } from '../../../store/uiStore'
import toolbar from '../EditorPage.module.css'
import { editorActions } from '../actions'
import { shortcutLabel } from '../shortcuts'
import styles from './ObjectMenu.module.css'
import { ObjectSwatch } from './ObjectSwatch'

const SHORTCUT_OF = {
  structures: 'addStructure',
  surfaces: 'addSurface',
  boundaries: 'addBoundary',
  extras: 'addExtra',
} as const

const ICONS = { structures: House, surfaces: Grid2x2, boundaries: Fence, extras: Droplets }

type Item = { kind: ObjectKind; variant?: SymbolVariantId }

/** A group's menu items: its kinds, with one item per variant for symbols. */
function itemsOf(group: PaletteGroup): Item[] {
  const kinds: readonly ObjectKind[] = OBJECT_PALETTE.find((g) => g.group === group)!.kinds
  return kinds.flatMap((kind): Item[] => {
    const variants = SYMBOL_VARIANTS[kind]
    return variants ? variants.map((v) => ({ kind, variant: v.id })) : [{ kind }]
  })
}

/**
 * A toolbar button for adding objects of one palette group (structures, surfaces, boundaries,
 * water & extras): a menu of presets. Choosing one starts drawing it: drag a rectangle, click its
 * corners or points, or place it at its default size.
 */
export function ObjectMenu({ group }: { group: PaletteGroup }) {
  const { t } = useTranslation()
  const open = useUiStore((s) => s.objectMenuOpen === group)
  const items = itemsOf(group)
  const Icon = ICONS[group]
  const drawing = useUiStore((s) =>
    s.drawing?.target.kind === 'object' ? s.drawing.target.objectKind : null,
  )
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const label = t(`editor.objects.groups.${group}.add`)
  const setOpen = (value: boolean) => useUiStore.getState().setObjectMenuOpen(value ? group : null)

  useEffect(() => {
    if (!open) return
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (!menu.current?.contains(target) && !button.current?.contains(target))
        useUiStore.getState().setObjectMenuOpen(null)
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

  function choose(item: Item) {
    setOpen(false)
    editorActions.drawObject(item.kind, item.variant)
  }

  return (
    <div className={styles.anchor}>
      <button
        ref={button}
        type="button"
        className={toolbar.toolButton}
        aria-label={label}
        title={`${label} (${shortcutLabel(SHORTCUT_OF[group])})`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-pressed={drawing !== null && items.some((i) => i.kind === drawing)}
        onClick={() => setOpen(!open)}
      >
        <Icon size={18} aria-hidden />
      </button>
      {open && (
        <div
          ref={menu}
          id={menuId}
          className={styles.menu}
          role="menu"
          aria-label={t(`editor.objects.groups.${group}.menu`)}
          onKeyDown={onKeyDown}
        >
          <p className={styles.menuTitle} aria-hidden>
            {t(`editor.objects.groups.${group}.menu`)}
          </p>
          {items.map((item) => {
            const { kind, variant } = item
            const symbol = variant
              ? SYMBOL_VARIANTS[kind]?.find((v) => v.id === variant)
              : undefined
            const size = OBJECT_PRESETS[kind].sizeM
            return (
              <button
                key={variant ?? kind}
                type="button"
                role="menuitem"
                className={styles.item}
                onClick={() => choose(item)}
              >
                <ObjectSwatch kind={kind} variant={variant} />
                <span className={styles.itemName}>
                  {t(variant ? `editor.symbolVariants.${variant}` : `editor.objectKinds.${kind}`)}
                </span>
                {symbol ? (
                  <span className={styles.itemSize}>
                    {symbol.round
                      ? t('editor.objects.diameterValue', {
                          diameter: formatDecimal(symbol.widthM, 1),
                        })
                      : t('editor.objects.sizeValue', {
                          width: formatDecimal(symbol.widthM, 1),
                          depth: formatDecimal(symbol.depthM, 1),
                        })}
                  </span>
                ) : (
                  size && (
                    <span className={styles.itemSize}>
                      {t('editor.objects.sizeValue', {
                        width: formatDecimal(size.width, 1),
                        depth: formatDecimal(size.depth, 1),
                      })}
                    </span>
                  )
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
