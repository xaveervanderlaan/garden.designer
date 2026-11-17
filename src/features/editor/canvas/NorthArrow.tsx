import { useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useProjectStore } from '../../../store/projectStore'
import { editorActions } from '../actions'
import { normaliseAngle, northAngleFromPointer } from '../view/sunView'
import styles from './NorthArrow.module.css'

/**
 * The plan's north arrow (M11): top-right of the plan area. Drag to turn it (Shift: 15° steps,
 * saved once on release), or use the arrow keys (±1°, Shift ±15°). An HTML overlay, so it is
 * keyboard-accessible; it turns the saved north angle, which the shadows follow.
 */
export function NorthArrow() {
  const { t } = useTranslation()
  const saved = useProjectStore((s) => s.project?.settings.northAngleDeg)
  const [draft, setDraft] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  if (saved === undefined) return null
  const angle = draft ?? saved

  const angleAt = (e: PointerEvent) => {
    const box = ref.current!.getBoundingClientRect()
    return northAngleFromPointer(
      { x: box.left + box.width / 2, y: box.top + box.height / 2 },
      { x: e.clientX, y: e.clientY },
      e.shiftKey,
    )
  }
  const onKeyDown = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 15 : 1
    const delta =
      e.key === 'ArrowRight' || e.key === 'ArrowUp'
        ? step
        : e.key === 'ArrowLeft' || e.key === 'ArrowDown'
          ? -step
          : 0
    if (!delta) return
    e.preventDefault()
    e.stopPropagation()
    editorActions.setNorthAngle(saved + delta, { coalesce: true })
  }

  return (
    <div
      ref={ref}
      className={styles.arrow}
      data-testid="north-arrow"
      role="slider"
      tabIndex={0}
      aria-label={t('editor.northArrow.label')}
      aria-valuemin={0}
      aria-valuemax={359}
      aria-valuenow={Math.round(normaliseAngle(angle))}
      title={t('editor.northArrow.hint')}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.stopPropagation()
        e.currentTarget.setPointerCapture?.(e.pointerId)
        setDraft(angleAt(e))
      }}
      onPointerMove={(e) => draft !== null && setDraft(angleAt(e))}
      onPointerUp={(e) => {
        if (draft === null) return
        const next = angleAt(e)
        setDraft(null)
        if (next !== saved) editorActions.setNorthAngle(next)
      }}
      onPointerCancel={() => setDraft(null)}
      // Keep Konva (and the plan's hit graph) out of it.
      onMouseDown={(e) => e.stopPropagation()}
    >
      <svg className={styles.svg} viewBox="-20 -20 40 40" aria-hidden="true">
        <g transform={`rotate(${angle})`}>
          <path className={styles.needle} d="M0 -9 L4.5 6 L0 3 L-4.5 6 Z" />
          <text
            className={styles.letter}
            transform={`translate(0 -14) rotate(${-angle})`}
            dominantBaseline="central"
          >
            {t('editor.northArrow.letter')}
          </text>
        </g>
      </svg>
    </div>
  )
}
