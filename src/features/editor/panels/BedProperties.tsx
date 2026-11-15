import { Carrot, Flower2, Trash2 } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { isSelfIntersecting, perimeter, polygonArea } from '../../../geometry/polygon'
import { formatArea, formatLength } from '../../../i18n/units'
import {
  BED_KINDS,
  type Bed,
  type BedKind,
  bedLayer,
  bedNumber,
  plantingsInBed,
  setBedEdgeLength,
} from '../../../model/beds'
import { updateObject } from '../../../model/edit'
import { MIN_PLOT_CORNERS, cornerLabel, hasPlot } from '../../../model/plot'
import type { Project } from '../../../model/schema'
import { useProjectStore } from '../../../store/projectStore'
import { useUiStore } from '../../../store/uiStore'
import controls from '../../../styles/controls.module.css'
import { cx } from '../../../styles/cx'
import { editorActions } from '../actions'
import { shortcutLabel } from '../shortcuts'
import { EdgeList } from './EdgeList'
import styles from './panels.module.css'

/** A selected bed: kind, area, plants in it, label and notes, and its edges (editable). */
export function BedProperties({ project, bed }: { project: Project; bed: Bed }) {
  const { t } = useTranslation()
  const update = useProjectStore((s) => s.update)
  const activeCorner = useUiStore((s) => s.activeCorner)
  const kindId = useId()
  const labelId = useId()
  const notesId = useId()
  const points = bed.shape.points
  const n = points.length
  const plants = plantingsInBed(project, bed.id).length
  const set = (field: 'label' | 'notes', value: string) =>
    update((p) => updateObject(p, bed.id, { [field]: value }), { coalesce: `${field}:${bed.id}` })

  return (
    <>
      <label className={controls.label} htmlFor={kindId}>
        {t('editor.properties.kind')}
      </label>
      <select
        id={kindId}
        className={cx(controls.input, styles.field)}
        value={bed.kind}
        data-testid="item-kind"
        onChange={(e) => editorActions.setBedKind(bed.id, e.target.value as BedKind)}
      >
        {BED_KINDS.map((kind) => (
          <option key={kind} value={kind}>
            {t(`editor.objectKinds.${kind}`)}
          </option>
        ))}
      </select>

      <dl className={styles.facts}>
        <dt>{t('editor.plot.area')}</dt>
        <dd data-testid="bed-area">{formatArea(polygonArea(points))}</dd>
        <dt>{t('editor.plot.perimeter')}</dt>
        <dd>{formatLength(perimeter(points))}</dd>
        <dt>{t('editor.beds.plants')}</dt>
        <dd data-testid="bed-plants">{plants}</dd>
      </dl>

      {isSelfIntersecting(points) && (
        <p className={styles.warning} role="alert">
          {t('editor.beds.selfIntersecting')}
        </p>
      )}

      <label className={controls.label} htmlFor={labelId}>
        {t('editor.beds.name')}
      </label>
      <input
        id={labelId}
        className={cx(controls.input, styles.field)}
        value={bed.label ?? ''}
        maxLength={200}
        placeholder={t(`editor.beds.defaultName.${bed.kind}`, {
          number: bedNumber(project, bed),
        })}
        onChange={(e) => set('label', e.target.value)}
      />
      <label className={controls.label} htmlFor={notesId}>
        {t('editor.properties.notes')}
      </label>
      <textarea
        id={notesId}
        className={cx(controls.input, styles.field, styles.notes)}
        value={bed.notes ?? ''}
        maxLength={5000}
        rows={2}
        onChange={(e) => set('notes', e.target.value)}
      />

      <p className={styles.hint}>{t('editor.beds.fillHint')}</p>

      <EdgeList
        outline={points}
        onLengthChange={(i, value) => update((p) => setBedEdgeLength(p, bed.id, i, value))}
      />
      {activeCorner !== null && activeCorner < n ? (
        <div className={styles.buttonColumn}>
          <button
            type="button"
            className={cx(controls.button, controls.small, styles.deleteButton)}
            disabled={n <= MIN_PLOT_CORNERS}
            title={n <= MIN_PLOT_CORNERS ? t('editor.beds.minCorners') : undefined}
            onClick={() => editorActions.removeBedCorner(bed.id, activeCorner)}
          >
            <Trash2 size={16} aria-hidden />
            {t('editor.plot.removeCorner', { corner: cornerLabel(activeCorner) })}
          </button>
        </div>
      ) : (
        <p className={styles.hint}>{t('editor.beds.cornerHint')}</p>
      )}
    </>
  )
}

/** With nothing selected (and a plot drawn): buttons to draw a bed. */
export function BedStart({ project }: { project: Project }) {
  const { t } = useTranslation()
  if (!hasPlot(project)) return null
  const kinds = BED_KINDS.filter((kind) => !project.layers[bedLayer(kind)].locked)
  if (kinds.length === 0) return null
  return (
    <div className={styles.buttonColumn}>
      {kinds.map((kind) => (
        <button
          key={kind}
          type="button"
          className={cx(controls.button, controls.small)}
          title={kind === 'bed-ornamental' ? shortcutLabel('drawBed') : undefined}
          onClick={() => editorActions.drawBed(kind)}
        >
          {kind === 'bed-ornamental' ? (
            <Flower2 size={16} aria-hidden />
          ) : (
            <Carrot size={16} aria-hidden />
          )}
          {kind === 'bed-ornamental'
            ? t('editor.beds.drawOrnamental')
            : t('editor.beds.drawVegetable')}
        </button>
      ))}
    </div>
  )
}
