import { X } from 'lucide-react'
import { Fragment, useEffect, useId, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useUiStore } from '../../../store/uiStore'
import { type KeyCombo, SHORTCUTS, type Shortcut, comboLabel } from '../shortcuts'
import styles from './panels.module.css'

const ARROW_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'])

/** Display groups for a shortcut; the four arrow keys collapse into one "←→↑↓" entry. */
function displayCombos(shortcut: Shortcut): string[][] {
  const combos = shortcut.combos
  if (combos.length === 4 && combos.every((c) => ARROW_KEYS.has(c.key))) {
    const modifiers = comboLabel({ ...combos[0]!, key: 'x' }).slice(0, -1)
    return [[...modifiers, '←→↑↓']]
  }
  return combos.map((combo: KeyCombo) => comboLabel(combo))
}

function Keys({ groups }: { groups: string[][] }) {
  return (
    <>
      {groups.map((keys, i) => (
        <Fragment key={i}>
          {i > 0 && <span className={styles.keySeparator}>/</span>}
          {keys.map((key) => (
            <kbd key={key} className={styles.kbd}>
              {key}
            </kbd>
          ))}
        </Fragment>
      ))}
    </>
  )
}

export function ShortcutHelp() {
  const { t } = useTranslation()
  const open = useUiStore((s) => s.helpOpen)
  const setOpen = useUiStore((s) => s.setHelpOpen)
  const titleId = useId()
  const closeButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    closeButton.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === '?') {
        event.preventDefault()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [open, setOpen])

  if (!open) return null

  const mouse: Array<{ keys: string[]; description: string }> = [
    {
      keys: [t('editor.shortcuts.keys.space'), t('editor.shortcuts.keys.drag')],
      description: t('editor.shortcuts.spacePan'),
    },
    { keys: [t('editor.shortcuts.keys.middleDrag')], description: t('editor.shortcuts.middlePan') },
    { keys: [t('editor.shortcuts.keys.wheel')], description: t('editor.shortcuts.wheelZoom') },
    { keys: [t('editor.shortcuts.keys.trackpad')], description: t('editor.shortcuts.trackpad') },
    {
      keys: [t('editor.shortcuts.keys.shiftClick')],
      description: t('editor.shortcuts.shiftClick'),
    },
  ]

  return (
    <div
      className={styles.backdrop}
      onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
    >
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className={styles.dialogHeader}>
          <h2 id={titleId} className={styles.dialogTitle}>
            {t('editor.shortcuts.title')}
          </h2>
          <button
            ref={closeButton}
            type="button"
            className={styles.iconButton}
            aria-label={t('editor.shortcuts.close')}
            onClick={() => setOpen(false)}
          >
            <X size={18} aria-hidden />
          </button>
        </div>
        <table className={styles.shortcutTable}>
          <tbody>
            {SHORTCUTS.map((shortcut) => (
              <tr key={shortcut.id}>
                <td>
                  <Keys groups={displayCombos(shortcut)} />
                </td>
                <td>{t(`editor.shortcuts.${shortcut.id}`)}</td>
              </tr>
            ))}
            {mouse.map(({ keys, description }) => (
              <tr key={description}>
                <td>
                  <Keys groups={[keys]} />
                </td>
                <td>{description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
