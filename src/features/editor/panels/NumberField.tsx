import { useEffect, useRef, useState } from 'react'
import { formatNumber, parseNumber } from '../../../i18n/units'
import controls from '../../../styles/controls.module.css'
import { cx } from '../../../styles/cx'
import styles from './panels.module.css'

/**
 * A number field that applies its value on Enter or when leaving the field, and follows outside
 * changes (dragging, undo) while you're not typing in it. Escape restores the current value.
 */
export function NumberField({
  id,
  value,
  label,
  digits = 2,
  format = (v) => formatNumber(v, digits),
  accept = Number.isFinite,
  onCommit,
}: {
  id?: string
  /** The value shown; NaN shows an empty field (e.g. several different values). */
  value: number
  /** Accessible name (the field has no visible label of its own). */
  label: string
  /** Decimals shown. */
  digits?: number
  /** How the value is shown (default: with `digits` decimals). */
  format?: (value: number) => string
  /** Whether a typed number is allowed; otherwise the field is marked invalid. */
  accept?: (value: number) => boolean
  onCommit: (value: number) => void
}) {
  const formatted = Number.isFinite(value) ? format(value) : ''
  const [text, setText] = useState(formatted)
  const [invalid, setInvalid] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  /** Set by Escape: the blur that follows must not apply the typed value. */
  const cancelled = useRef(false)

  useEffect(() => {
    if (document.activeElement !== input.current) setText(formatted)
  }, [formatted])

  function apply() {
    if (cancelled.current) {
      cancelled.current = false
      setText(formatted)
      setInvalid(false)
      return
    }
    if (text === formatted) {
      setInvalid(false)
      return
    }
    const parsed = parseNumber(text)
    if (parsed === undefined || !accept(parsed)) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    if (format(parsed) !== formatted) onCommit(parsed)
    else setText(formatted)
  }

  return (
    <input
      ref={input}
      id={id}
      className={cx(controls.input, styles.edgeInput)}
      aria-label={label}
      aria-invalid={invalid}
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        setInvalid(false)
      }}
      onBlur={apply}
      // Leaving the field applies the value; Enter leaves it, Escape leaves it without applying.
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur()
        } else if (e.key === 'Escape') {
          cancelled.current = true
          e.currentTarget.blur()
        }
      }}
    />
  )
}
