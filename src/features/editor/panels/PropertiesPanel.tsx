import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpToLine, Trash2 } from 'lucide-react'
import { useId, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { isBed } from '../../../model/beds'
import { type ReorderDirection, reorderItems } from '../../../model/drawOrder'
import { validSelection } from '../../../model/edit'
import { BACKGROUND_ID } from '../../../model/background'
import { editedByCorners } from '../../../model/objectKinds'
import { PLOT_ID } from '../../../model/plot'
import type { Project } from '../../../model/schema'
import { useUiStore } from '../../../store/uiStore'
import controls from '../../../styles/controls.module.css'
import { cx } from '../../../styles/cx'
import { editorActions } from '../actions'
import { type ShortcutId, shortcutLabel } from '../shortcuts'
import { BedProperties } from './BedProperties'
import { ObjectProperties } from './ObjectProperties'
import { PlantingProperties } from './PlantingProperties'
import { NothingSelected, PlotProperties } from './PlotProperties'
import { SitePlanProperties } from './SitePlanProperties'
import styles from './panels.module.css'

export function PropertiesPanel({ project }: { project: Project }) {
  const { t } = useTranslation()
  const titleId = useId()
  const selectionIds = useUiStore((s) => s.selection)
  const ids = useMemo(() => validSelection(project, selectionIds), [project, selectionIds])

  const object = ids.length === 1 ? project.objects.find((o) => o.id === ids[0]) : undefined
  const items = ids.filter((id) => id !== PLOT_ID && id !== BACKGROUND_ID)
  // One or more plantings (and nothing else): their species, year, …
  const plantings = useMemo(() => {
    const selected = new Set(ids)
    const found = project.plantings.filter((p) => selected.has(p.id))
    return found.length === ids.length ? found : []
  }, [project, ids])

  return (
    <section className={styles.panel} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.title}>
        {t('editor.properties.title')}
      </h2>
      {ids.length === 0 && <NothingSelected project={project} />}
      {ids.length > 1 && (
        <p className={styles.text}>{t('editor.properties.multiple', { count: ids.length })}</p>
      )}
      {ids.length === 1 && ids[0] === PLOT_ID && <PlotProperties project={project} />}
      {ids.length === 1 && ids[0] === BACKGROUND_ID && project.background && (
        <SitePlanProperties background={project.background} />
      )}
      {object &&
        (isBed(object) && editedByCorners(object.kind) ? (
          <BedProperties project={project} bed={object} />
        ) : (
          <ObjectProperties project={project} object={object} />
        ))}
      {plantings.length > 0 && <PlantingProperties project={project} plantings={plantings} />}
      {items.length > 0 && <DrawingOrder project={project} ids={items} />}
      {items.length > 0 && (
        <button
          type="button"
          className={cx(controls.button, controls.small, styles.deleteButton)}
          onClick={editorActions.deleteSelection}
        >
          <Trash2 size={16} aria-hidden />
          {t('editor.properties.delete')}
        </button>
      )}
    </section>
  )
}

const ORDER: Array<{ direction: ReorderDirection; shortcut: ShortcutId; icon: typeof ArrowUp }> = [
  { direction: 'back', shortcut: 'sendToBack', icon: ArrowDownToLine },
  { direction: 'backward', shortcut: 'sendBackward', icon: ArrowDown },
  { direction: 'forward', shortcut: 'bringForward', icon: ArrowUp },
  { direction: 'front', shortcut: 'bringToFront', icon: ArrowUpToLine },
]

/**
 * Bring forward / send back, within the item's drawing band (surfaces, beds, plants, structures,
 * tree canopies). A button is disabled when it wouldn't change anything.
 */
function DrawingOrder({ project, ids }: { project: Project; ids: readonly string[] }) {
  const { t } = useTranslation()
  const selected = new Set(ids)
  return (
    <div className={styles.orderRow} role="group" aria-label={t('editor.objects.order.label')}>
      <span className={styles.orderLabel}>{t('editor.objects.order.label')}</span>
      {ORDER.map(({ direction, shortcut, icon: Icon }) => {
        const label = t(`editor.objects.order.${direction}`)
        return (
          <button
            key={direction}
            type="button"
            className={styles.iconButton}
            aria-label={label}
            title={`${label} (${shortcutLabel(shortcut)})`}
            disabled={reorderItems(project, selected, direction) === project}
            onClick={() => editorActions.reorder(direction)}
          >
            <Icon size={16} aria-hidden />
          </button>
        )
      })}
    </div>
  )
}
