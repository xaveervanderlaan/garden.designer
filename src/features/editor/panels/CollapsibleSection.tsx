import { ChevronDown, ChevronRight } from 'lucide-react'
import { useId, useState } from 'react'
import styles from './panels.module.css'

/** A side-panel section whose title opens and closes it. */
export function CollapsibleSection({
  title,
  badge,
  defaultOpen = true,
  children,
}: {
  title: string
  /** Shown after the title, e.g. a count; nothing when null. */
  badge?: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const titleId = useId()
  const contentId = useId()
  return (
    <section className={styles.panel} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.title}>
        <button
          type="button"
          className={styles.sectionToggle}
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => setOpen(!open)}
        >
          {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
          {title}
          {badge !== undefined && badge !== null && (
            <span className={styles.titleBadge}>{badge}</span>
          )}
        </button>
      </h2>
      {open && <div id={contentId}>{children}</div>}
    </section>
  )
}
