import { Trash2 } from 'lucide-react'
import { useId, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { boundsCentre, shapeBounds } from '../../../geometry/bounds'
import { currentLanguage } from '../../../i18n'
import { formatLength } from '../../../i18n/units'
import { updateObject, updatePlanting, validSelection } from '../../../model/edit'
import { findPlant } from '../../../model/plants'
import { PLOT_ID } from '../../../model/plot'
import type { GardenObject, Planting, Point, Project } from '../../../model/schema'
import { useProjectStore } from '../../../store/projectStore'
import { useUiStore } from '../../../store/uiStore'
import controls from '../../../styles/controls.module.css'
import { cx } from '../../../styles/cx'
import { editorActions } from '../actions'
import { NothingSelected, PlotProperties } from './PlotProperties'
import styles from './panels.module.css'

export function PropertiesPanel({ project }: { project: Project }) {
  const { t } = useTranslation()
  const titleId = useId()
  const selectionIds = useUiStore((s) => s.selection)
  const ids = useMemo(() => validSelection(project, selectionIds), [project, selectionIds])

  const object = ids.length === 1 ? project.objects.find((o) => o.id === ids[0]) : undefined
  const planting = ids.length === 1 ? project.plantings.find((p) => p.id === ids[0]) : undefined

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
      {object && <ObjectProperties object={object} />}
      {planting && <PlantingProperties project={project} planting={planting} />}
      {ids.some((id) => id !== PLOT_ID) && (
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

function PositionRow({ position }: { position: Point }) {
  const { t } = useTranslation()
  return (
    <>
      <dt>{t('editor.properties.position')}</dt>
      <dd data-testid="item-position">
        {t('editor.properties.positionValue', {
          x: formatLength(position.x),
          y: formatLength(position.y),
        })}
      </dd>
    </>
  )
}

function ObjectProperties({ object }: { object: GardenObject }) {
  const { t } = useTranslation()
  const update = useProjectStore((s) => s.update)
  const labelId = useId()
  const notesId = useId()
  const set = (field: 'label' | 'notes', value: string) =>
    update((p) => updateObject(p, object.id, { [field]: value }), {
      coalesce: `${field}:${object.id}`,
    })

  return (
    <>
      <dl className={styles.facts}>
        <dt>{t('editor.properties.kind')}</dt>
        <dd data-testid="item-kind">{t(`editor.objectKinds.${object.kind}`)}</dd>
        <PositionRow position={boundsCentre(shapeBounds(object.shape))} />
      </dl>
      <label className={controls.label} htmlFor={labelId}>
        {t('editor.properties.label')}
      </label>
      <input
        id={labelId}
        className={cx(controls.input, styles.field)}
        value={object.label ?? ''}
        maxLength={200}
        onChange={(e) => set('label', e.target.value)}
      />
      <label className={controls.label} htmlFor={notesId}>
        {t('editor.properties.notes')}
      </label>
      <textarea
        id={notesId}
        className={cx(controls.input, styles.field, styles.notes)}
        value={object.notes ?? ''}
        maxLength={5000}
        rows={3}
        onChange={(e) => set('notes', e.target.value)}
      />
    </>
  )
}

function PlantingProperties({ project, planting }: { project: Project; planting: Planting }) {
  const { t } = useTranslation()
  const update = useProjectStore((s) => s.update)
  const notesId = useId()
  const plant = findPlant(project, planting.plantId)

  return (
    <>
      <dl className={styles.facts}>
        <dt>{t('editor.properties.plant')}</dt>
        <dd>{plant ? plant.names[currentLanguage()] : t('editor.properties.unknownPlant')}</dd>
        <PositionRow position={planting.position} />
        <dt>{t('editor.properties.plantedYear')}</dt>
        <dd>{planting.plantedYear}</dd>
      </dl>
      <label className={controls.label} htmlFor={notesId}>
        {t('editor.properties.notes')}
      </label>
      <textarea
        id={notesId}
        className={cx(controls.input, styles.field, styles.notes)}
        value={planting.notes ?? ''}
        maxLength={5000}
        rows={3}
        onChange={(e) =>
          update((p) => updatePlanting(p, planting.id, { notes: e.target.value }), {
            coalesce: `notes:${planting.id}`,
          })
        }
      />
    </>
  )
}
