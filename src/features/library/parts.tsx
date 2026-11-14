import { useId, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { formatMonths, monthLong, monthShort } from '../../i18n/months'
import { MONTHS, type Plant, type PlantColor } from '../../model/schema'
import { cx } from '../../styles/cx'
import { PLANT_COLOR_HEX, needsOutline } from '../../styles/plantColors'
import { plantSymbol } from '../../styles/plantSymbols'
import styles from './library.module.css'

/** The plant's symbol on the plan, as a small SVG. */
export function PlantSymbol({ plant, size }: { plant: Plant; size: number }) {
  const parts = useMemo(() => plantSymbol(plant), [plant])
  return (
    <svg
      className={styles.symbol}
      width={size}
      height={size}
      viewBox="-1.1 -1.1 2.2 2.2"
      aria-hidden
      focusable="false"
    >
      {parts.map((part, i) => (
        <path
          key={i}
          d={part.d}
          fill={part.fill ?? 'none'}
          fillOpacity={part.fillOpacity}
          stroke={part.stroke}
          strokeWidth={part.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  )
}

/** A colour dot with its name, e.g. in the detail card. */
export function ColorChip({ color }: { color: PlantColor }) {
  const { t } = useTranslation()
  return (
    <span className={styles.colorChip}>
      <span
        className={cx(styles.dot, needsOutline(color) && styles.dotOutlined)}
        style={{ background: PLANT_COLOR_HEX[color] }}
        aria-hidden
      />
      {t(`plants.colors.${color}`)}
    </span>
  )
}

/** Twelve cells, January to December; the given months are filled. Read out as a month list. */
export function MonthStrip({
  months,
  label,
  color,
}: {
  months: readonly number[]
  label: string
  color?: string
}) {
  const { t } = useTranslation()
  const text = formatMonths(months) || t('editor.library.detail.none')
  return (
    <span
      className={styles.monthStrip}
      role="img"
      aria-label={t('plants.monthsValue', { label, months: text })}
      title={text}
    >
      {MONTHS.map((m) => {
        const on = months.includes(m)
        return (
          <span
            key={m}
            className={cx(styles.monthCell, on && styles.monthOn)}
            style={on && color ? { background: color } : undefined}
          >
            {monthShort(m).charAt(0).toUpperCase()}
          </span>
        )
      })}
    </span>
  )
}

/** Toggle buttons for the twelve months (multiple choice). */
export function MonthToggles({
  value,
  label,
  onChange,
}: {
  value: readonly number[]
  label: string
  onChange: (months: number[]) => void
}) {
  return (
    <div className={styles.monthGrid} role="group" aria-label={label}>
      {MONTHS.map((m) => {
        const on = value.includes(m)
        return (
          <button
            key={m}
            type="button"
            className={styles.monthButton}
            aria-pressed={on}
            aria-label={monthLong(m)}
            title={monthLong(m)}
            onClick={() => onChange(on ? value.filter((v) => v !== m) : [...value, m])}
          >
            {monthShort(m)}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Colour swatches as toggle buttons. With `multiple`, any number can be on; otherwise clicking a
 * swatch selects only that one.
 */
export function ColorToggles<C extends PlantColor>({
  colors,
  value,
  label,
  multiple = true,
  onChange,
}: {
  colors: readonly C[]
  value: readonly C[]
  label: string
  multiple?: boolean
  onChange: (colors: C[]) => void
}) {
  const { t } = useTranslation()
  return (
    <div className={styles.swatches} role="group" aria-label={label}>
      {colors.map((color) => {
        const on = value.includes(color)
        const name = t(`plants.colors.${color}`)
        return (
          <button
            key={color}
            type="button"
            className={cx(styles.swatch, needsOutline(color) && styles.dotOutlined)}
            style={{ background: PLANT_COLOR_HEX[color] }}
            aria-pressed={on}
            aria-label={name}
            title={name}
            onClick={() =>
              onChange(
                multiple ? (on ? value.filter((c) => c !== color) : [...value, color]) : [color],
              )
            }
          />
        )
      })}
    </div>
  )
}

/** A set of checkboxes for a multiple-choice field (light, soil, wildlife…). */
export function CheckboxGroup<V extends string>({
  options,
  value,
  label,
  invalid,
  onChange,
}: {
  options: ReadonlyArray<{ value: V; label: string }>
  value: readonly V[]
  label: string
  invalid?: boolean
  onChange: (value: V[]) => void
}) {
  const id = useId()
  return (
    <fieldset className={styles.fieldset} aria-invalid={invalid || undefined}>
      <legend className={styles.legend}>{label}</legend>
      <div className={styles.checks}>
        {options.map((option) => {
          const on = value.includes(option.value)
          return (
            <label key={option.value} className={styles.check} htmlFor={`${id}-${option.value}`}>
              <input
                id={`${id}-${option.value}`}
                type="checkbox"
                checked={on}
                onChange={() =>
                  onChange(on ? value.filter((v) => v !== option.value) : [...value, option.value])
                }
              />
              {option.label}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
