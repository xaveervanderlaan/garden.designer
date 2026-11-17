import { Check, Spline, Trash2 } from 'lucide-react'
import { useId, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { boundsCentre, objectBounds } from '../../../geometry/bounds'
import { shapeFrameBox } from '../../../geometry/frame'
import { isSelfIntersecting, perimeter, polygonArea } from '../../../geometry/polygon'
import { formatArea, formatDecimal, formatLength } from '../../../i18n/units'
import { isBed, plantingsInBed } from '../../../model/beds'
import { updateObject } from '../../../model/edit'
import {
  SYMBOL_VARIANTS,
  type MaterialId,
  hasHeight,
  kindsLike,
  materialOf,
  materialsFor,
  symbolFor,
  type SymbolVariantId,
} from '../../../model/objectKinds'
import { surfaceAreas } from '../../../model/netArea'
import { allPlants, findPlant, plantName } from '../../../model/plants'
import { defaultRowSpacingM, hedgePlantCount } from '../../../model/plantings'
import {
  MIN_POINTS,
  MIN_THICKNESS_M,
  objectRotation,
  setObjectEdgeLength,
} from '../../../model/objects'
import { cornerLabel } from '../../../model/plot'
import {
  type GardenObject,
  OBJECT_STATUSES,
  type ObjectKind,
  type ObjectStatus,
  type Project,
} from '../../../model/schema'
import { useProjectStore } from '../../../store/projectStore'
import { useUiStore } from '../../../store/uiStore'
import controls from '../../../styles/controls.module.css'
import { cx } from '../../../styles/cx'
import { editorActions } from '../actions'
import { shortcutLabel } from '../shortcuts'
import { useBedName } from './bedName'
import { EdgeList } from './EdgeList'
import { NumberField } from './NumberField'
import styles from './panels.module.css'

const MAX_SIZE_M = 1000
const MAX_HEIGHT_M = 300

/** Existing or new, for objects or (with `plantings`) plantings. */
export function StatusField({
  ids,
  status,
  plantings = false,
}: {
  ids: readonly string[]
  /** The current status, or undefined when the selected items differ. */
  status: ObjectStatus | undefined
  plantings?: boolean
}) {
  const { t } = useTranslation()
  const id = useId()
  return (
    <>
      <label className={controls.label} htmlFor={id}>
        {t('editor.objects.status')}
      </label>
      <select
        id={id}
        className={cx(controls.input, styles.field)}
        value={status ?? ''}
        data-testid="item-status"
        onChange={(e) => {
          const value = e.target.value as ObjectStatus
          if (plantings) editorActions.setPlantingStatus(ids, value)
          else editorActions.setObjectStatus(ids, value)
        }}
      >
        {!status && <option value="" />}
        {OBJECT_STATUSES.map((value) => (
          <option key={value} value={value}>
            {t(`editor.objects.statuses.${value}`)}
          </option>
        ))}
      </select>
    </>
  )
}

/** A labelled number field on one line, with its unit. */
function InlineNumber({
  label,
  value,
  testId,
  digits,
  accept,
  onCommit,
}: {
  label: string
  value: number
  testId: string
  digits?: number
  accept: (value: number) => boolean
  onCommit: (value: number) => void
}) {
  const id = useId()
  return (
    <div className={styles.inlineField} data-testid={testId}>
      <label className={styles.inlineLabel} htmlFor={id}>
        {label}
      </label>
      <NumberField
        id={id}
        value={value}
        label={label}
        digits={digits}
        accept={accept}
        onCommit={onCommit}
      />
    </div>
  )
}

/**
 * A selected object (other than a bed edited by its corners): type, status, label, height, size
 * and rotation, area, its corners on request, and notes.
 */
export function ObjectProperties({ project, object }: { project: Project; object: GardenObject }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language.startsWith('nl') ? 'nl' : 'en'
  const update = useProjectStore((s) => s.update)
  const editingCorners = useUiStore((s) => s.editingCorners === object.id)
  const activeCorner = useUiStore((s) => s.activeCorner)
  const bedName = useBedName(project)
  const kindId = useId()
  const labelId = useId()
  const notesId = useId()
  const materialId = useId()
  const variantId = useId()
  const hedgeId = useId()
  const areas = useMemo(
    () => (object.shape.type === 'polygon' ? surfaceAreas(project, object.id) : null),
    [project, object.id, object.shape.type],
  )
  const materials = materialsFor(object.kind)
  const variants = SYMBOL_VARIANTS[object.kind] ?? []
  const symbol = symbolFor(object.kind, object.variant)
  const hedgePlant =
    object.kind === 'hedge' && object.plantId ? findPlant(project, object.plantId) : undefined
  const hedgeOptions = useMemo(
    () =>
      object.kind === 'hedge'
        ? allPlants(project)
            .filter((plant) => plant.category === 'hedge')
            .sort((a, b) => plantName(a, lang).localeCompare(plantName(b, lang), lang))
        : [],
    [project, object.kind, lang],
  )
  const set = (field: 'label' | 'notes', value: string) =>
    update((p) => updateObject(p, object.id, { [field]: value }), {
      coalesce: `${field}:${object.id}`,
    })
  const shape = object.shape
  const kinds = kindsLike(object.kind)
  const box = shapeFrameBox(shape)
  const rotation = objectRotation(shape)
  const sizeOk = (value: number) => value > 0 && value <= MAX_SIZE_M

  return (
    <>
      {kinds.length > 1 ? (
        <>
          <label className={controls.label} htmlFor={kindId}>
            {t('editor.properties.kind')}
          </label>
          <select
            id={kindId}
            className={cx(controls.input, styles.field)}
            value={object.kind}
            data-testid="item-kind"
            onChange={(e) => editorActions.setObjectKind(object.id, e.target.value as ObjectKind)}
          >
            {kinds.map((kind) => (
              <option key={kind} value={kind}>
                {t(`editor.objectKinds.${kind}`)}
              </option>
            ))}
          </select>
        </>
      ) : (
        <dl className={styles.facts}>
          <dt>{t('editor.properties.kind')}</dt>
          <dd data-testid="item-kind">{t(`editor.objectKinds.${object.kind}`)}</dd>
        </dl>
      )}

      <StatusField ids={[object.id]} status={object.status} />

      <label className={controls.label} htmlFor={labelId}>
        {isBed(object) ? t('editor.beds.name') : t('editor.properties.label')}
      </label>
      <input
        id={labelId}
        className={cx(controls.input, styles.field)}
        value={object.label ?? ''}
        maxLength={200}
        placeholder={
          isBed(object)
            ? bedName(object)
            : hedgePlant
              ? plantName(hedgePlant, lang)
              : t(`editor.objectKinds.${object.kind}`)
        }
        onChange={(e) => set('label', e.target.value)}
      />

      {materials.length > 1 && (
        <>
          <label className={controls.label} htmlFor={materialId}>
            {t('editor.objects.material')}
          </label>
          <select
            id={materialId}
            className={cx(controls.input, styles.field)}
            value={materialOf(object) ?? ''}
            data-testid="object-material"
            onChange={(e) =>
              editorActions.setObjectMaterial(object.id, e.target.value as MaterialId)
            }
          >
            {materials.map((material) => (
              <option key={material} value={material}>
                {t(`editor.materials.${material}`)}
              </option>
            ))}
          </select>
        </>
      )}

      {variants.length > 1 && (
        <>
          <label className={controls.label} htmlFor={variantId}>
            {t('editor.objects.variant')}
          </label>
          <select
            id={variantId}
            className={cx(controls.input, styles.field)}
            value={symbol?.id ?? ''}
            data-testid="object-variant"
            onChange={(e) =>
              editorActions.setObjectVariant(object.id, e.target.value as SymbolVariantId)
            }
          >
            {variants.map((v) => (
              <option key={v.id} value={v.id}>
                {t(`editor.symbolVariants.${v.id}`)}
              </option>
            ))}
          </select>
        </>
      )}

      {object.kind === 'hedge' && (
        <>
          <label className={controls.label} htmlFor={hedgeId}>
            {t('editor.objects.hedgePlant')}
          </label>
          <select
            id={hedgeId}
            className={cx(controls.input, styles.field)}
            value={hedgePlant?.id ?? ''}
            data-testid="hedge-plant"
            onChange={(e) => editorActions.setHedgePlant(object.id, e.target.value || null)}
          >
            <option value="">{t('editor.objects.noHedgePlant')}</option>
            {hedgeOptions.map((plant) => (
              <option key={plant.id} value={plant.id}>
                {plantName(plant, lang)}
              </option>
            ))}
          </select>
        </>
      )}

      {hasHeight(object.kind) && (
        <InlineNumber
          label={t('editor.objects.height')}
          value={object.heightM ?? Number.NaN}
          testId="object-height"
          accept={(value) => value > 0 && value <= MAX_HEIGHT_M}
          onCommit={(value) => editorActions.setObjectHeight(object.id, value)}
        />
      )}

      {shape.type === 'polygon' && (
        <>
          <InlineNumber
            label={t('editor.objects.width')}
            value={box.width}
            testId="object-width"
            accept={sizeOk}
            onCommit={(value) => editorActions.resizeObject(object.id, { widthM: value })}
          />
          <InlineNumber
            label={t('editor.objects.depth')}
            value={box.depth}
            testId="object-depth"
            accept={sizeOk}
            onCommit={(value) => editorActions.resizeObject(object.id, { depthM: value })}
          />
        </>
      )}
      {shape.type === 'polyline' && (
        <InlineNumber
          label={t('editor.objects.thickness')}
          value={shape.thicknessM}
          testId="object-thickness"
          accept={(value) => value >= MIN_THICKNESS_M && value <= 10}
          onCommit={(value) => editorActions.setThickness(object.id, value)}
        />
      )}
      {rotation !== null && (
        <InlineNumber
          label={t('editor.objects.rotation')}
          value={rotation}
          testId="object-rotation"
          digits={1}
          accept={(value) =>
            shape.type === 'point' ? Number.isFinite(value) : value >= -45 && value <= 45
          }
          onCommit={(value) => editorActions.rotateObject(object.id, value)}
        />
      )}

      <dl className={styles.facts}>
        {shape.type === 'polygon' && (
          <>
            <dt>{areas ? t('editor.objects.grossArea') : t('editor.plot.area')}</dt>
            <dd data-testid="object-area">
              {formatArea(areas?.grossM2 ?? polygonArea(shape.points))}
            </dd>
            {areas && (
              <>
                <dt>{t('editor.objects.netArea')}</dt>
                <dd data-testid="object-net-area">{formatArea(areas.netM2)}</dd>
              </>
            )}
            <dt>{t('editor.plot.perimeter')}</dt>
            <dd>{formatLength(perimeter(shape.points))}</dd>
          </>
        )}
        {shape.type === 'polyline' && (
          <>
            <dt>{t('editor.objects.length')}</dt>
            <dd data-testid="object-length">{formatLength(perimeter(shape.points, false))}</dd>
            {hedgePlant && (
              <>
                <dt>{t('editor.objects.hedgePlantCount')}</dt>
                <dd data-testid="hedge-plant-count">
                  {t('editor.objects.hedgePlantsValue', {
                    count: hedgePlantCount(perimeter(shape.points, false), hedgePlant),
                    spacing: formatLength(defaultRowSpacingM(hedgePlant)),
                  })}
                </dd>
              </>
            )}
          </>
        )}
        {shape.type === 'point' && symbol && (
          <>
            <dt>{t('editor.objects.size')}</dt>
            <dd data-testid="object-size">
              {symbol.round
                ? t('editor.objects.diameterValue', { diameter: formatDecimal(symbol.widthM, 1) })
                : t('editor.objects.sizeValue', {
                    width: formatDecimal(symbol.widthM, 1),
                    depth: formatDecimal(symbol.depthM, 1),
                  })}
            </dd>
          </>
        )}
        {isBed(object) && (
          <>
            <dt>{t('editor.beds.plants')}</dt>
            <dd data-testid="bed-plants">{plantingsInBed(project, object.id).length}</dd>
          </>
        )}
        <dt>{t('editor.properties.position')}</dt>
        <dd data-testid="item-position">
          {t('editor.properties.positionValue', {
            x: formatLength(boundsCentre(objectBounds(object)).x),
            y: formatLength(boundsCentre(objectBounds(object)).y),
          })}
        </dd>
      </dl>

      {shape.type === 'polygon' && isSelfIntersecting(shape.points) && (
        <p className={styles.warning} role="alert">
          {t('editor.plot.selfIntersecting')}
        </p>
      )}

      {shape.type !== 'point' && (
        <CornerEditing
          object={object}
          points={shape.points}
          closed={shape.type === 'polygon'}
          editing={editingCorners}
          activeCorner={activeCorner}
        />
      )}

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

/** Switching to corner editing, and while on: the edges and removing the selected corner. */
function CornerEditing({
  object,
  points,
  closed,
  editing,
  activeCorner,
}: {
  object: GardenObject
  points: readonly { x: number; y: number }[]
  closed: boolean
  editing: boolean
  activeCorner: number | null
}) {
  const { t } = useTranslation()
  const update = useProjectStore((s) => s.update)
  const n = points.length
  const minimum = closed ? MIN_POINTS.polygon : MIN_POINTS.polyline
  if (!editing) {
    return (
      <>
        <p className={styles.hint}>{t('editor.objects.transformHint')}</p>
        <div className={styles.buttonColumn}>
          <button
            type="button"
            className={cx(controls.button, controls.small)}
            title={shortcutLabel('editCorners')}
            onClick={editorActions.toggleCornerEditing}
          >
            <Spline size={16} aria-hidden />
            {t('editor.objects.editCorners')}
          </button>
        </div>
        <div className={styles.spacer} />
      </>
    )
  }
  return (
    <>
      <EdgeList
        outline={points}
        closed={closed}
        onLengthChange={(i, value) => update((p) => setObjectEdgeLength(p, object.id, i, value))}
      />
      {activeCorner !== null && activeCorner < n ? (
        <div className={styles.buttonColumn}>
          <button
            type="button"
            className={cx(controls.button, controls.small, styles.deleteButton)}
            disabled={n <= minimum}
            title={
              n <= minimum
                ? closed
                  ? t('editor.objects.minCorners')
                  : t('editor.objects.minPoints')
                : undefined
            }
            onClick={() => editorActions.removeObjectCorner(object.id, activeCorner)}
          >
            <Trash2 size={16} aria-hidden />
            {t('editor.plot.removeCorner', { corner: cornerLabel(activeCorner) })}
          </button>
        </div>
      ) : (
        <p className={styles.hint}>{t('editor.objects.cornerHint')}</p>
      )}
      <div className={styles.buttonColumn}>
        <button
          type="button"
          className={cx(controls.button, controls.small)}
          aria-pressed
          title={shortcutLabel('editCorners')}
          onClick={editorActions.toggleCornerEditing}
        >
          <Check size={16} aria-hidden />
          {t('editor.objects.stopEditingCorners')}
        </button>
      </div>
      <div className={styles.spacer} />
    </>
  )
}
